// api/weather.js
// Fetch weather data from OpenWeatherMap API
import { requireSession } from "../lib/auth.js";
import { getDb } from "../lib/mongo.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

// Get user's saved location preference
async function getUserLocation(db, userId) {
  const users = db.collection("users");
  const user = await users.findOne(
    { userId },
    { projection: { "preferences.location": 1 } }
  );
  return user?.preferences?.location || null;
}

// Save user's location preference
async function saveUserLocation(db, userId, location) {
  const users = db.collection("users");
  await users.updateOne(
    { userId },
    {
      $set: {
        "preferences.location": {
          city: location.city,
          state: location.state || "",
          country: location.country,
          lat: location.lat,
          lon: location.lon,
          confirmedAt: new Date().toISOString(),
        },
      },
    },
    { upsert: true }
  );
}

const LOCATION_TOLERANCE = 0.0001;

function coordinatesMatch(existing, lat, lon) {
  if (!existing) return false;
  const storedLat = Number(existing.lat);
  const storedLon = Number(existing.lon);
  if (Number.isNaN(storedLat) || Number.isNaN(storedLon)) return false;
  return (
    Math.abs(storedLat - lat) < LOCATION_TOLERANCE &&
    Math.abs(storedLon - lon) < LOCATION_TOLERANCE
  );
}

export default async function handler(req, res) {
  const s = requireSession(req, res);
  if (!s) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
  if (!OPENWEATHER_API_KEY) {
    return json(res, 500, { error: "OPENWEATHER_API_KEY not configured" });
  }

  try {
    const body = await readBody(req);
    const { action, city, state, country, lat, lon, skipSavedLocation } = body;

    const db = await getDb();

    // ACTION: Get user's saved location
    if (action === "get_location") {
      const location = await getUserLocation(db, s.userId);
      if (location) {
        return json(res, 200, { ok: true, location });
      } else {
        return json(res, 200, { ok: true, location: null });
      }
    }

    // ACTION: Save user's location preference
    if (action === "save_location") {
      if (!city || !lat || !lon) {
        return json(res, 400, { error: "Missing city, lat, or lon" });
      }
      await saveUserLocation(db, s.userId, {
        city,
        state: state || "",
        country: country || "",
        lat,
        lon,
      });
      return json(res, 200, { ok: true, saved: true });
    }

    // ACTION: Get weather forecast
    if (action === "get_forecast") {
      const existingLocation = skipSavedLocation ? null : await getUserLocation(db, s.userId);
      const { saveLocation } = body;
      const effectiveSaveLocation = !skipSavedLocation && !!saveLocation;

      let weatherLat = lat;
      let weatherLon = lon;
      let weatherCity = city;
      let weatherState = state || "";
      let weatherCountry = country || "";

      const ensureFromSaved = () => {
        if (existingLocation) {
          weatherLat = existingLocation.lat;
          weatherLon = existingLocation.lon;
          weatherCity = existingLocation.city;
          weatherState = existingLocation.state || "";
          weatherCountry = existingLocation.country || "";
        }
      };

      if (!weatherLat || !weatherLon) {
        if (city) {
          const geoParts = [city];
          if (state) geoParts.push(state);
          if (country) geoParts.push(country);
          const geoQuery = geoParts.join(",");
          const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
            geoQuery
          )}&limit=5&appid=${OPENWEATHER_API_KEY}`;
          const geoRes = await fetch(geoUrl);
          if (!geoRes.ok) {
            const geoErr = await geoRes.text();
            return json(res, geoRes.status, { error: "Geocoding error", detail: geoErr });
          }
          const geoData = await geoRes.json();

          const normalize = (v) => String(v || "").trim();
          const toKey = (c) =>
            `${normalize(c.name).toLowerCase()}|${normalize(c.state).toLowerCase()}|${normalize(c.country).toLowerCase()}`;

          const candidates = Array.isArray(geoData)
            ? geoData.map((g) => ({
                name: g.name,
                state: g.state || "",
                country: g.country || "",
                lat: g.lat,
                lon: g.lon,
              }))
            : [];

          const wantCountry = normalize(country).toLowerCase();
          const wantState = normalize(state).toLowerCase();
          let filtered = candidates;
          if (wantCountry) {
            const byCountry = filtered.filter(
              (c) => normalize(c.country).toLowerCase() === wantCountry
            );
            if (byCountry.length > 0) filtered = byCountry;
          }
          if (wantState) {
            const byState = filtered.filter(
              (c) => normalize(c.state).toLowerCase() === wantState
            );
            if (byState.length > 0) filtered = byState;
          }

          const seen = new Set();
          const unique = [];
          for (const c of filtered) {
            const k = toKey(c);
            if (seen.has(k)) continue;
            seen.add(k);
            unique.push(c);
          }

          if (unique.length === 0) {
            return json(res, 404, { error: "City not found", code: "city_not_found" });
          }
          if (unique.length > 1) {
            return json(res, 200, {
              ok: false,
              error: "Multiple locations found",
              code: "multiple_locations",
              candidates: unique.slice(0, 3).map((c) => ({
                city: c.name,
                state: c.state || "",
                country: c.country || "",
                lat: c.lat,
                lon: c.lon,
              })),
            });
          }

          const chosen = unique[0];
          weatherLat = chosen.lat;
          weatherLon = chosen.lon;
          weatherCity = chosen.name;
          weatherState = chosen.state || "";
          weatherCountry = chosen.country || "";
        } else {
          ensureFromSaved();
        }
      }

      if ((!weatherLat || !weatherLon) && !existingLocation) {
        return json(res, 200, {
          ok: false,
          error: "No location provided and no saved location",
          code: "missing_location",
        });
      }

      if (!weatherCity && existingLocation) {
        weatherCity = existingLocation.city;
        weatherState = existingLocation.state || "";
        weatherCountry = existingLocation.country || "";
      }

      const needsCountryUpdate =
        existingLocation &&
        !existingLocation.country &&
        weatherCountry &&
        coordinatesMatch(existingLocation, Number(weatherLat), Number(weatherLon));

      const shouldPersistLocation =
        (effectiveSaveLocation && weatherCity && weatherLat && weatherLon) || needsCountryUpdate;

      if (shouldPersistLocation) {
        console.log(
          needsCountryUpdate
            ? "💾 Updating saved location with country for user:"
            : "💾 Auto-saving location:",
          weatherCity,
          "for user:",
          s.userId
        );
        try {
          await saveUserLocation(db, s.userId, {
            city: weatherCity,
            state: weatherState || "",
            country: weatherCountry || existingLocation?.country || "",
            lat: weatherLat,
            lon: weatherLon,
          });
          console.log("✅ Location saved successfully to MongoDB");
        } catch (error) {
          console.error("❌ Failed to save location:", error.message);
          console.error(error);
        }
      } else {
        console.log("⚠️  Location NOT saved - condition not met");
      }

      const weatherUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${weatherLat}&lon=${weatherLon}&exclude=minutely,alerts&units=metric&appid=${OPENWEATHER_API_KEY}`;

      const weatherRes = await fetch(weatherUrl);

      if (!weatherRes.ok) {
        const errorText = await weatherRes.text();
        return json(res, weatherRes.status, {
          error: "OpenWeatherMap API error",
          detail: errorText,
        });
      }

      const weatherData = await weatherRes.json();

      return json(res, 200, {
        ok: true,
        location: {
          city: weatherCity,
          state: weatherState,
          country: weatherCountry,
          lat: weatherLat,
          lon: weatherLon,
          timezone: weatherData.timezone,
          timezone_offset: weatherData.timezone_offset,
        },
        current: {
          dt: weatherData.current.dt,
          temp: weatherData.current.temp,
          feels_like: weatherData.current.feels_like,
          humidity: weatherData.current.humidity,
          description: weatherData.current.weather[0].description,
          icon: weatherData.current.weather[0].icon,
        },
        hourly: weatherData.hourly.slice(0, 24).map((h) => ({
          time: h.dt,
          temp: h.temp,
          pop: h.pop,
          description: h.weather[0].description,
        })),
        daily: weatherData.daily.slice(0, 5).map((d) => ({
          date: d.dt,
          temp_min: d.temp.min,
          temp_max: d.temp.max,
          pop: d.pop,
          description: d.weather[0].description,
        })),
      });
    }

    return json(res, 400, { error: "Invalid action" });
  } catch (error) {
    console.error("Weather API error:", error);
    return json(res, 500, {
      error: "Internal server error",
      detail: error.message,
    });
  }
}
