// UIManager.js
// All HUD is plain DOM layered over the canvas. Everything is pointer-events:none
// except the touch-button strip. Courier New throughout, cyan accent (#40d4ff).

import { C, L, LAYERS } from "../core/Constants.js";
import { CODEX } from "../core/GameState.js";

const ACCENT = "#40d4ff";
const BODY = "rgba(180,220,255,0.72)";
const PANEL_BG = "rgba(0,0,0,0.55)";
const PANEL_BORDER = "rgba(0,180,255,0.15)";

function el(tag, style, parent, text) {
  const e = document.createElement(tag);
  if (style) e.style.cssText = style;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export class UIManager {
  constructor(state) {
    this.state = state;
    this.root = document.getElementById("ui");
    this.root.style.fontFamily = "'Courier New', Courier, monospace";
    this._build();
    this._wireEvents();
    this._msgTimer = 0;
  }

  _build() {
    // ---------- TOP-LEFT layer box ----------
    this.layerBox = el(
      "div",
      `position:absolute;top:14px;left:14px;padding:8px 14px;
       background:${PANEL_BG};border-left:2px solid rgba(64,200,255,0.4);
       border-radius:2px;`,
      this.root
    );
    this.layerName = el(
      "div",
      `color:${ACCENT};font-size:16px;letter-spacing:3px;text-transform:uppercase;`,
      this.layerBox,
      "PRE-DISTINCTION"
    );
    this.layerNum = el(
      "div",
      `color:${BODY};font-size:9px;letter-spacing:1px;margin-top:3px;`,
      this.layerBox,
      "LAYER 0 / 14"
    );

    // ---------- TOP-RIGHT progress panel ----------
    this.progPanel = el(
      "div",
      `position:absolute;top:14px;right:14px;width:150px;padding:10px;
       background:${PANEL_BG};border:1px solid ${PANEL_BORDER};border-radius:3px;`,
      this.root
    );
    this.bars = {};
    const barDefs = [
      ["Distinction", "dist"],
      ["Sustained", "sust"],
      ["Relation", "rel"],
      ["Physical", "phys"],
      ["Chemical", "chem"],
      ["Biological", "bio"],
    ];
    for (const [label, key] of barDefs) {
      el(
        "div",
        `color:${BODY};font-size:8px;letter-spacing:1px;margin-bottom:2px;text-transform:uppercase;`,
        this.progPanel,
        label
      );
      const track = el(
        "div",
        `height:8px;background:rgba(255,255,255,0.06);border-radius:2px;margin-bottom:7px;overflow:hidden;`,
        this.progPanel
      );
      const fill = el(
        "div",
        `height:100%;width:0%;background:rgba(64,200,255,0.8);border-radius:2px;transition:width 0.25s;`,
        track
      );
      this.bars[key] = fill;
    }

    // ---------- CENTER message overlay ----------
    this.msg = el(
      "div",
      `position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);
       max-width:480px;width:86%;text-align:center;opacity:0;
       transition:opacity 0.7s;pointer-events:none;`,
      this.root
    );
    this.msgTitle = el(
      "div",
      `color:${ACCENT};font-size:20px;letter-spacing:4px;text-transform:uppercase;margin-bottom:14px;`,
      this.msg
    );
    this.msgBody = el(
      "div",
      `color:${BODY};font-size:12px;font-style:italic;line-height:1.9;`,
      this.msg
    );

    // ---------- TOP-CENTER achievement flash ----------
    this.flash = el(
      "div",
      `position:absolute;left:50%;top:18%;transform:translateX(-50%);
       text-align:center;opacity:0;transition:opacity 0.6s;`,
      this.root
    );
    this.flashSmall = el(
      "div",
      `color:${BODY};font-size:9px;letter-spacing:5px;text-transform:uppercase;`,
      this.flash,
      "EMERGENCE"
    );
    this.flashBig = el(
      "div",
      `color:${ACCENT};font-size:18px;letter-spacing:3px;margin-top:5px;text-transform:uppercase;`,
      this.flash
    );

    // ---------- BOTTOM-CENTER cell HUD ----------
    this.cellHud = el(
      "div",
      `position:absolute;left:50%;bottom:22px;transform:translateX(-50%);
       width:80%;max-width:360px;text-align:center;display:none;`,
      this.root
    );
    el(
      "div",
      `color:${BODY};font-size:8px;letter-spacing:2px;margin-bottom:4px;`,
      this.cellHud,
      "ENERGY"
    );
    const enTrack = el(
      "div",
      `height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;`,
      this.cellHud
    );
    this.energyFill = el(
      "div",
      `height:100%;width:100%;background:#40ffa0;`,
      enTrack
    );
    this.traitText = el(
      "div",
      `color:${BODY};font-size:9px;letter-spacing:1px;margin-top:6px;line-height:1.6;`,
      this.cellHud,
      "undifferentiated"
    );

    // ---------- hint line (above buttons) ----------
    this.hint = el(
      "div",
      `position:absolute;right:60px;bottom:18px;color:${BODY};font-size:9px;
       max-width:160px;text-align:right;`,
      this.root,
      "Touch: energize · 2-finger: cool · Pinch: zoom"
    );

    // ---------- BOTTOM-RIGHT touch buttons ----------
    this.btnStrip = el(
      "div",
      `position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;
       gap:8px;pointer-events:auto;`,
      this.root
    );
    this._buttons = {};
    const btnDefs = [
      ["◈", "codex"],
      ["⏸", "pause"],
      ["⊙", "debug"],
      ["↺", "reset"],
    ];
    for (const [glyph, key] of btnDefs) {
      const b = el(
        "div",
        `width:38px;height:38px;display:flex;align-items:center;justify-content:center;
         border:1px solid rgba(64,200,255,0.3);background:rgba(0,0,0,0.6);
         border-radius:4px;color:${ACCENT};font-size:18px;cursor:pointer;
         user-select:none;touch-action:none;`,
        this.btnStrip,
        glyph
      );
      this._buttons[key] = b;
      const handler = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._onButton(key);
      };
      b.addEventListener("touchstart", handler, { passive: false });
      b.addEventListener("click", handler);
    }

    // ---------- LEFT codex panel ----------
    this.codexPanel = el(
      "div",
      `position:absolute;left:14px;top:90px;width:210px;max-height:60vh;overflow-y:auto;
       background:${PANEL_BG};border:1px solid ${PANEL_BORDER};border-radius:3px;
       padding:12px;display:none;`,
      this.root
    );
    el(
      "div",
      `color:${ACCENT};font-size:10px;letter-spacing:3px;margin-bottom:10px;`,
      this.codexPanel,
      "CODEX"
    );
    this.codexEntries = el("div", ``, this.codexPanel);

    // ---------- BOTTOM-LEFT debug ----------
    this.debug = el(
      "div",
      `position:absolute;left:14px;bottom:14px;color:${BODY};font-size:9px;
       line-height:1.55;background:rgba(0,0,0,0.4);padding:8px;border-radius:3px;
       display:none;white-space:pre;`,
      this.root
    );

    // ---------- PAUSE indicator ----------
    this.pauseInd = el(
      "div",
      `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
       color:${ACCENT};font-size:24px;letter-spacing:8px;opacity:0;
       transition:opacity 0.3s;`,
      this.root,
      "PAUSED"
    );

    // initial codex entry
    this._refreshCodex();
  }

  _onButton(key) {
    if (key === "codex") this.state.emit("toggleCodex");
    else if (key === "pause") {
      this.state.paused = !this.state.paused;
      this.state.emit("togglePause");
    } else if (key === "debug") this.state.emit("toggleDebug");
    else if (key === "reset") location.reload();
  }

  _wireEvents() {
    const st = this.state;
    st.on("layerTransition", (from, to) => this._onTransition(from, to));
    st.on("biologicalAchieved", () => this._onBiological());
    st.on("toggleCodex", () => {
      this.codexPanel.style.display =
        this.codexPanel.style.display === "none" ? "block" : "none";
    });
    st.on("toggleDebug", () => {
      this.debug.style.display =
        this.debug.style.display === "none" ? "block" : "none";
    });
    st.on("togglePause", () => {
      this.pauseInd.style.opacity = st.paused ? "1" : "0";
    });
    st.on("enterCellStage", () => this._enterCell());
    st.on("cellDied", () => this._showMessage("THE BOUNDARY DISSOLVED",
      "Your membrane could not maintain itself. Press R to begin again.", 1e9));
  }

  _onTransition(from, to) {
    this.state.unlockedCodex.add(to);
    this._refreshCodex();
    this._showMessage(LAYERS[to], CODEX[to], 9);
  }

  _onBiological() {
    this.flashSmall.textContent = "EMERGENCE";
    this.flashBig.textContent = "BIOLOGICAL AUTONOMY ACHIEVED";
    this.flash.style.opacity = "1";
    setTimeout(() => (this.flash.style.opacity = "0"), 3500);
  }

  _enterCell() {
    this.cellHud.style.display = "block";
    this.progPanel.style.display = "none";
    this.hint.textContent = "Touch to swim · 2-finger: burst · Pinch: zoom";
  }

  _showMessage(title, body, seconds) {
    this.msgTitle.textContent = title;
    this.msgBody.textContent = body;
    this.msg.style.opacity = "1";
    this._msgTimer = seconds;
  }

  _refreshCodex() {
    this.codexEntries.innerHTML = "";
    const ids = [...this.state.unlockedCodex].sort((a, b) => a - b);
    for (const id of ids) {
      const wrap = el("div", "margin-bottom:11px;", this.codexEntries);
      el(
        "div",
        `color:${ACCENT};font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;`,
        wrap,
        LAYERS[id]
      );
      el(
        "div",
        `color:${BODY};font-size:10px;font-style:italic;line-height:1.78;`,
        wrap,
        CODEX[id]
      );
    }
  }

  _setBar(fill, ratio, complete) {
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    fill.style.width = pct + "%";
    fill.style.background = complete ? "#40ffa0" : "rgba(64,200,255,0.8)";
  }

  update(dt) {
    const st = this.state;

    // layer box
    this.layerName.textContent = LAYERS[st.layer];
    this.layerNum.textContent = `LAYER ${st.layer} / 14`;

    // progress bars (only layers 0-6)
    if (st.layer <= L.BIOLOGICAL && st.phase === "emergence") {
      this.progPanel.style.display = "block";
      this._setBar(this.bars.dist, st.vContrast / C.T_CONTRAST, st.layer > L.PRE);
      this._setBar(this.bars.sust, st.distTimer / C.T_DIST_DUR, st.layer > L.PRE);
      this._setBar(this.bars.rel, st.vContrast / 0.26, st.layer > L.DIST);
      this._setBar(this.bars.phys, st.particleCount / C.T_PART, st.layer > L.PROCESS);
      this._setBar(this.bars.chem, st.bondRatio / C.T_BOND_R, st.layer > L.PHYSICAL);
      this._setBar(this.bars.bio, st.autopoiesis / C.T_AUTO, st.layer > L.CHEMICAL);
    } else {
      this.progPanel.style.display = "none";
    }

    // message auto-fade
    if (this._msgTimer > 0 && this._msgTimer < 1e8) {
      this._msgTimer -= dt;
      if (this._msgTimer <= 0) this.msg.style.opacity = "0";
    }

    // cell HUD
    if (st.phase !== "emergence" && st.cellAlive) {
      const e = Math.max(0, Math.min(1, st.cellEnergy / 1.4));
      this.energyFill.style.width = e * 100 + "%";
      this.energyFill.style.background =
        st.cellEnergy / 1.4 > 0.5 ? "#40ffa0" : st.cellEnergy / 1.4 > 0.25 ? "#ffd23f" : "#ff5a5a";
      this.traitText.textContent = this._traits(st.cellMorph);
    }

    // debug
    if (this.debug.style.display !== "none") {
      this.debug.textContent = this._debugText(dt);
    }
  }

  _traits(m) {
    const parts = [];
    const add = (sym, name, v) => {
      if (v > 0.08) parts.push(`${sym} ${name} ${Math.round(v * 100)}%`);
    };
    add("⬧", "spike", m.sharpness);
    add("~", "tail", m.flagella);
    add("◎", "shell", m.armor);
    add("↔", "body", m.elongation);
    add("•", "sense", m.cilia);
    return parts.length ? parts.join("  ") : "undifferentiated";
  }

  _debugText() {
    const st = this.state;
    const f = (n, d = 4) => (n == null ? "-" : Number(n).toFixed(d));
    return (
      `v-CONTRAST ${f(st.vContrast, 3)} / ${C.T_CONTRAST}\n` +
      `FLOW COH   ${f(st.flowCoherence, 5)}\n` +
      `v-PATCHES  ${st.patchCount}\n` +
      `PARTICLES  ${st.particleCount} / ${C.T_PART}\n` +
      `BONDS      ${st.bondCount}\n` +
      `BOND RATIO ${f(st.bondRatio, 3)} / ${C.T_BOND_R}\n` +
      `MEM STABIL ${f(st.membraneStability, 3)}\n` +
      `INT ENERGY ${f(st.intEnergy, 3)}\n` +
      `AUTOPOIESIS ${f(st.autopoiesis, 3)} / ${C.T_AUTO}\n` +
      `CELL ENERGY ${f(st.cellEnergy, 2)}\n` +
      `EATINGS    ${st.eatings}\n` +
      `FPS        ${Math.round(st.fps)}\n` +
      `LAYER ${st.layer} ${st.phase} t=${f(st.time, 1)}`
    );
  }
}
