// public/sideNavManager.js
import { t } from "./i18n/index.js";

const SIDENAV_HOME_PILLS = [
  { pillKey: "sideNavPillHelp",     pillClass: "snp-light",      labelKey: "sideNavLabelHelp",     nav: null },
  { pillKey: "sideNavPillMyInfo",   pillClass: "snp-light",      labelKey: "sideNavLabelMyInfo",   nav: "miInfo" },
  // account pill is inserted here dynamically
  { pillKey: "sideNavPillTomas",    pillClass: "snp-salmon",     labelKey: "sideNavLabelTomas",    nav: "tomas" },
  { pillKey: "sideNavPillInit",     pillClass: "snp-yellow",     labelKey: "sideNavLabelInit",     nav: "iniciaTu" },
  { pillKey: "sideNavPillMisTemas", pillClass: "snp-light",      labelKey: "sideNavLabelMisTemas", nav: "misTemas" },
  { pillKey: "sideNavPillLatest",   pillClass: "snp-magenta",    labelKey: "sideNavLabelLatest",   nav: "latest" },
  { pillKey: "sideNavPillNews",     pillClass: "snp-light",      labelKey: "sideNavLabelNews",     nav: "news" },
  { pillKey: "sideNavPillTalk",     pillClass: "snp-green",      labelKey: "sideNavLabelTalk",     nav: "talk" },
  { pillKey: "sideNavPillWrite",    pillClass: "snp-dark-blue",  labelKey: "sideNavLabelWrite",    nav: "write" },
];

const SIDENAV_DETAIL_CONFIGS = {
  tomas: {
    pillKey:  "sideNavPillTomas",
    pillClass: "snp-salmon",
    titleKey: "sideNavTomasTitleText",
    blocks: [
      { type: "text",     key: "sideNavTomasText1" },
      { type: "text",     key: "sideNavTomasText2" },
      { type: "pill-btn", key: "sideNavTomasAddBtn", pillClass: "snp-green" },
      { type: "text",     key: "sideNavTomasText3" },
      { type: "text",     key: "sideNavTomasText4" },
      { type: "image",    src: "images/brenda-avatar.png" },
      { type: "text",     key: "sideNavTomasText5" },
      { type: "text",     key: "sideNavTomasText6" },
      { type: "text",     key: "sideNavTomasText7" },
      { type: "pill-btn", key: "sideNavSaveBtn", pillClass: "snp-green" },
    ],
  },
  miInfo: {
    pillKey:  "sideNavPillMyInfo",
    pillClass: "snp-light",
    titleKey: "sideNavMiInfoTitleText",
    blocks: [
      { type: "text",     key: "sideNavMiInfoText1" },
      { type: "text",     key: "sideNavMiInfoText2" },
      { type: "text",     key: "sideNavMiInfoText3" },
      { type: "text",     key: "sideNavMiInfoText4" },
      { type: "image",    src: "images/brenda-avatar.png" },
      { type: "text",     key: "sideNavMiInfoText5" },
      { type: "text",     key: "sideNavMiInfoText6" },
      { type: "pill-btn", key: "sideNavSaveBtn", pillClass: "snp-green" },
    ],
  },
  anon: {
    pillKey:  "accountBtnAnonymous",
    pillClass: "snp-light",
    titleKey: "sideNavAnonTitleText",
    blocks: [
      { type: "text",  key: "sideNavAnonText1" },
      { type: "text",  key: "sideNavAnonText2" },
      { type: "text",  key: "sideNavAnonText3" },
      { type: "text",  key: "sideNavAnonText4" },
      { type: "text",  key: "sideNavAnonText5" },
      { type: "text",  key: "sideNavAnonText6" },
      { type: "image", src: "images/brenda-avatar.png" },
      { type: "text",  key: "sideNavAnonText7" },
      { type: "text",  key: "sideNavAnonText8" },
    ],
  },
  cuenta: {
    pillDynamic: true,
    pillClass: "snp-light",
    titleKey: "sideNavCuentaTitleText",
    blocks: [
      { type: "text",  key: "sideNavCuentaText1" },
      { type: "text",  key: "sideNavCuentaText2" },
      { type: "text",  key: "sideNavCuentaText3" },
      { type: "text",  key: "sideNavCuentaText4" },
      { type: "text",  key: "sideNavCuentaText5" },
      { type: "text",  key: "sideNavCuentaText6" },
      { type: "image", src: "images/brenda-avatar.png" },
      { type: "text",  key: "sideNavAnonText7" },
      { type: "text",  key: "sideNavAnonText8" },
    ],
  },
  misTemas: {
    pillKey:   "sideNavPillMisTemas",
    pillClass: "snp-light-blue",
    titleKey:  "sideNavLabelMisTemas",
    blocks: [
      { type: "text",  key: "sideNavMisTemasText1" },
      { type: "text",  key: "sideNavMisTemasText2" },
      { type: "text",  key: "sideNavMisTemasText3" },
      { type: "text",  key: "sideNavMisTemasText4" },
      { type: "text",     key: "sideNavMisTemasText5" },
      { type: "pill-btn", key: "sideNavPillInit", pillClass: "snp-yellow" },
    ],
  },
  write: {
    pillKey:   "sideNavPillWrite",
    pillClass: "snp-dark-blue",
    titleKey:  "sideNavLabelWrite",
    blocks: [
      { type: "text", key: "sideNavWriteText1" },
      { type: "text", key: "sideNavWriteText2" },
      { type: "text", key: "sideNavWriteText3" },
      { type: "text", key: "sideNavWriteText4" },
      { type: "text", key: "sideNavWriteText5" },
      { type: "text", key: "sideNavWriteText6" },
      { type: "text", key: "sideNavWriteText7" },
    ],
  },
  talk: {
    pillKey:   "sideNavPillTalk",
    pillClass: "snp-green",
    titleKey:  "sideNavTalkTitleText",
    blocks: [
      { type: "text", key: "sideNavTalkText1" },
      { type: "text", key: "sideNavTalkText2" },
      { type: "text", key: "sideNavTalkText3" },
      { type: "text", key: "sideNavTalkText4" },
      { type: "text", key: "sideNavTalkText5" },
      { type: "text", key: "sideNavTalkText6" },
      { type: "text", key: "sideNavTalkText7" },
    ],
  },
  news: {
    pillKey:   "sideNavPillNews",
    pillClass: "snp-light",
    titleKey:  "sideNavNewsTitleText",
    blocks: [
      { type: "text", key: "sideNavNewsText1" },
      { type: "text", key: "sideNavNewsText2" },
      { type: "text", key: "sideNavNewsText3" },
      { type: "text", key: "sideNavNewsText4" },
      { type: "text", key: "sideNavNewsText5" },
      { type: "text", key: "sideNavNewsText6" },
    ],
  },
  latest: {
    pillKey:   "sideNavPillLatest",
    pillClass: "snp-magenta",
    titleKey:  "sideNavLabelLatest",
    blocks: [
      { type: "text",  key: "sideNavLatestText1" },
      { type: "text",  key: "sideNavLatestText2" },
      { type: "text",  key: "sideNavLatestText3" },
      { type: "text",  key: "sideNavLatestText4" },
      { type: "text",     key: "sideNavLatestText5" },
      { type: "pill-btn", key: "sideNavPillNews", pillClass: "snp-light" },
    ],
  },
  iniciaTu: {
    pillKey:  "sideNavPillInit",
    pillClass: "snp-yellow",
    titleKey: "sideNavInitTitleText",
    blocks: [
      { type: "text",  key: "sideNavInitText1" },
      { type: "text",  key: "sideNavInitText2" },
      { type: "text",  key: "sideNavInitText3" },
      { type: "text",  key: "sideNavInitText4" },
      { type: "text",  key: "sideNavInitText5" },
      { type: "text",  key: "sideNavInitText6" },
      { type: "image", src: "images/mis_temas_01.png", wrapClass: "sidenav-rectangular-img-wrap" },
    ],
  },
};

export class SideNavManager {
  constructor(locale, getUser) {
    this._locale  = locale;
    this._getUser = getUser;
  }

  positionPanels() {
    const container = document.querySelector(".container");
    const wrapper   = document.getElementById("sideNavWrapper");
    if (!container || !wrapper) return;
    const r = container.getBoundingClientRect();
    wrapper.style.left   = r.left + "px";
    wrapper.style.top    = r.top  + "px";
    wrapper.style.width  = r.width  + "px";
    wrapper.style.height = r.height + "px";
  }

  openSideNavHome() {
    this.positionPanels();
    const panel = document.getElementById("sideNavHome");
    if (!panel) return;
    this._renderSideNavHome(panel, this._locale.variant);
    panel.classList.add("sidenav-open");
    panel.setAttribute("aria-hidden", "false");
  }

  closeSideNavHome() {
    document.querySelectorAll(".sidenav-detail").forEach((p) => {
      p.classList.remove("sidenav-open");
      p.setAttribute("aria-hidden", "true");
    });
    const panel = document.getElementById("sideNavHome");
    if (!panel) return;
    panel.classList.remove("sidenav-open");
    panel.setAttribute("aria-hidden", "true");
  }

  openSideNavDetail(name) {
    this.positionPanels();
    const id = "sideNav" + name.charAt(0).toUpperCase() + name.slice(1);
    const panel = document.getElementById(id);
    if (!panel) return;
    this._renderSideNavDetail(panel, name, this._locale.variant);
    panel.classList.add("sidenav-open");
    panel.setAttribute("aria-hidden", "false");
  }

  closeSideNavDetail(name) {
    const id = "sideNav" + name.charAt(0).toUpperCase() + name.slice(1);
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.remove("sidenav-open");
    panel.setAttribute("aria-hidden", "true");
  }

  _renderSideNavHome(panel, v) {
    const inner = panel.querySelector(".sidenav-inner");
    if (!inner) return;

    const user   = this._getUser();
    const isAnon = !user || user.isAnonymous;
    const accountPillText  = isAnon
      ? t(v, "accountBtnAnonymous")
      : (user.displayName || user.username || t(v, "accountBtnAnonymous"));
    const accountLabelKey  = isAnon ? "sideNavLabelAnon" : "sideNavLabelAccount";
    const accountNav       = isAnon ? "anon" : "cuenta";

    const accountRowHtml = `
      <div class="sidenav-pill-row${accountNav ? " sidenav-pill-row--nav" : ""}" data-nav="${accountNav}">
        <div class="sidenav-pill-col">
          <span class="snp snp-light">${this._snEsc(accountPillText)}</span>
        </div>
        <span class="sidenav-row-label">${this._snEsc(t(v, accountLabelKey))}</span>
      </div>`;

    const beforeAccount = SIDENAV_HOME_PILLS.slice(0, 2);
    const afterAccount  = SIDENAV_HOME_PILLS.slice(2);

    const pillsHtml = (pills) => pills.map((pill) => {
      const isNav = !!pill.nav;
      return `<div class="sidenav-pill-row${isNav ? " sidenav-pill-row--nav" : ""}" data-nav="${pill.nav || ""}">
        <div class="sidenav-pill-col">
          <span class="snp ${pill.pillClass}">${this._snEsc(t(v, pill.pillKey))}</span>
        </div>
        <span class="sidenav-row-label">${this._snEsc(t(v, pill.labelKey))}</span>
      </div>`;
    }).join("");

    inner.innerHTML = `
      <div class="sidenav-close-row">
        <button class="sidenav-close-btn js-snav-home-close">
          <span class="sidenav-close-label">${this._snEsc(t(v, "sideNavCloseLabel"))}</span>
          <span class="sidenav-close-x">×</span>
        </button>
      </div>
      <p class="sidenav-intro">${this._snEsc(t(v, "sideNavIntro"))}</p>
      <div class="sidenav-pill-list">
        ${pillsHtml(beforeAccount)}
        ${accountRowHtml}
        ${pillsHtml(afterAccount)}
      </div>`;

    inner.querySelector(".js-snav-home-close")
      ?.addEventListener("click", () => this.closeSideNavHome());

    inner.querySelectorAll(".sidenav-pill-row--nav").forEach((row) => {
      const nav = row.dataset.nav;
      if (nav) row.addEventListener("click", () => this.openSideNavDetail(nav));
    });
  }

  _renderSideNavDetail(panel, name, v) {
    const cfg = SIDENAV_DETAIL_CONFIGS[name];
    if (!cfg) return;
    const inner = panel.querySelector(".sidenav-inner");
    if (!inner) return;

    const user = this._getUser();
    const blocksHtml = cfg.blocks.map((block) => {
      if (block.type === "text") {
        return `<p class="sidenav-text-block">${this._snEsc(t(v, block.key))}</p>`;
      }
      if (block.type === "pill-btn") {
        return `<div class="sidenav-pill-btn-wrap">
          <span class="snp ${block.pillClass}">${this._snEsc(t(v, block.key))}</span>
        </div>`;
      }
      if (block.type === "image") {
        const imgWrap = block.wrapClass ?? "sidenav-round-img-wrap";
        return `<div class="${imgWrap}">
          <img src="${block.src}" alt="Brenda" />
        </div>`;
      }
      return "";
    }).join("");

    inner.innerHTML = `
      <div class="sidenav-close-row">
        <button class="sidenav-close-btn js-snav-detail-close">
          <span class="sidenav-close-label">${this._snEsc(t(v, "sideNavCloseLabel"))}</span>
          <span class="sidenav-close-x">×</span>
        </button>
      </div>
      <div class="sidenav-title-row">
        <div class="sidenav-title-col">
          <span class="snp ${cfg.pillClass}">${this._snEsc(cfg.pillDynamic ? (user?.displayName || t(v, "accountBtnAnonymous")) : t(v, cfg.pillKey))}</span>
        </div>
        <span class="sidenav-title-text">${this._snEsc(t(v, cfg.titleKey))}</span>
      </div>
      <div class="sidenav-body">${blocksHtml}</div>`;

    inner.querySelector(".js-snav-detail-close")
      ?.addEventListener("click", () => this.closeSideNavDetail(name));
  }

  _snEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
