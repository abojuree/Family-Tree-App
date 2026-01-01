/* tree.js
 * شجرة العائلة (Canvas) - نسخة مفصولة (Logic + Render + Interaction)
 * يعتمد على وجود:
 * - const DATA = [...] في data.js
 * - عناصر التحكم (inputs/buttons) في index.html
 * - canvas#canvas و div#tooltip و pre#settingsCode
 */

(function () {
  "use strict";

  class AdvancedTree {
    constructor(options = {}) {
      this.canvas = document.getElementById(options.canvasId || "canvas");
      this.ctx = this.canvas.getContext("2d");

      // State
      this.nodes = new Map();
      this.root = null;

      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;

      this.draggingPan = false;
      this.dragStart = { x: 0, y: 0 };
      this.panStart = { x: 0, y: 0 };

      this.hoveredNode = null;
      this.showAxis = false;

      this.draggedNode = null;           // node object
      this.draggedNodeStart = null;      // {x,y}
      this.dragPointerStart = null;      // {x,y}
      this.customPositions = new Map();  // id -> {x,y}

      // double click detection (fallback)
      this.lastClickTime = 0;
      this.lastClickNode = null;

      // Settings (قابلة للتعديل من الواجهة)
      this.settings = {
        leafSize: 13,
        fontSize: 9,
        spacing: 90,
        angleSpread: 40,
        trunkWidth: 90,
        trunkHeight: 300,
        branchThickness: 1.0,
        gravity: 4,
        rightBias: 50,
        leafColors: {
          c1: "#C8E6C9",
          c2: "#A5D6A7",
          c3: "#81C784",
          c4: "#66BB6A",
        },
        rootColor: "#8B4513",
        branchColor: "#D4AF37",
        nodeColor: "#FF6B6B",
        textColor: "#FFFFFF",
      };

      // Layout anchors
      this.resize();
      this.trunkX = this.canvas.width / 2;
      this.groundY = this.canvas.height - 80;

      // Init
      this.setupControls();
      this.build();
      this.setupEvents();
      this.draw();
      this.updateSettingsCode();
    }

    // ─────────────────────────────────────────────────────────
    // Controls
    // ─────────────────────────────────────────────────────────
    setupControls() {
      // Helper safe binding
      const bindRange = (id, onInput) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.oninput = onInput;
      };
      const bindColor = (id, onInput) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.oninput = onInput;
      };

      bindRange("rightBias", (e) => {
        this.settings.rightBias = parseInt(e.target.value, 10);
        const v = document.getElementById("rightBiasValue");
        if (v) v.textContent = e.target.value + "%";
        this.rebuild();
        this.updateSettingsCode();
      });

      bindRange("leafSize", (e) => {
        this.settings.leafSize = parseInt(e.target.value, 10);
        const v = document.getElementById("leafSizeValue");
        if (v) v.textContent = e.target.value;
        this.draw();
        this.updateSettingsCode();
      });

      bindRange("fontSize", (e) => {
        this.settings.fontSize = parseInt(e.target.value, 10);
        const v = document.getElementById("fontSizeValue");
        if (v) v.textContent = e.target.value + "px";
        this.draw();
        this.updateSettingsCode();
      });

      bindRange("spacing", (e) => {
        this.settings.spacing = parseInt(e.target.value, 10);
        const v = document.getElementById("spacingValue");
        if (v) v.textContent = e.target.value + "px";
        this.rebuild();
        this.updateSettingsCode();
      });

      // Leaf colors
      ["leafColor1", "leafColor2", "leafColor3", "leafColor4"].forEach((id, i) => {
        bindColor(id, (e) => {
          this.settings.leafColors["c" + (i + 1)] = e.target.value;
          this.draw();
          this.updateSettingsCode();
        });
      });

      // Branch/root/node/text colors
      bindColor("rootColor", (e) => {
        this.settings.rootColor = e.target.value;
        this.draw();
        this.updateSettingsCode();
      });
      bindColor("branchColor", (e) => {
        this.settings.branchColor = e.target.value;
        this.draw();
        this.updateSettingsCode();
      });
      bindColor("nodeColor", (e) => {
        this.settings.nodeColor = e.target.value;
        this.draw();
        this.updateSettingsCode();
      });
      bindColor("textColor", (e) => {
        this.settings.textColor = e.target.value;
        this.draw();
        this.updateSettingsCode();
      });

      // Trunk
      bindRange("trunkWidth", (e) => {
        this.settings.trunkWidth = parseInt(e.target.value, 10);
        const v = document.getElementById("trunkWidthValue");
        if (v) v.textContent = e.target.value + "px";
        this.draw();
        this.updateSettingsCode();
      });

      bindRange("trunkHeight", (e) => {
        this.settings.trunkHeight = parseInt(e.target.value, 10);
        const v = document.getElementById("trunkHeightValue");
        if (v) v.textContent = e.target.value + "px";
        this.rebuild();
        this.updateSettingsCode();
      });

      // Branches
      bindRange("branchThickness", (e) => {
        this.settings.branchThickness = parseFloat(e.target.value);
        const v = document.getElementById("branchThicknessValue");
        if (v) v.textContent = e.target.value + "x";
        this.draw();
        this.updateSettingsCode();
      });

      bindRange("gravity", (e) => {
        this.settings.gravity = parseFloat(e.target.value);
        const v = document.getElementById("gravityValue");
        if (v) v.textContent = e.target.value + "x";
        this.rebuild();
        this.updateSettingsCode();
      });
    }

    // ─────────────────────────────────────────────────────────
    // Build tree (data -> nodes -> layout)
    // ─────────────────────────────────────────────────────────
    resize() {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.trunkX = this.canvas.width / 2;
      this.groundY = this.canvas.height - 80;
    }

    build() {
      this.buildNodes();
      this.calcDepth();

      // تصفية الشجرة حسب المستوى المطلوب
      const levelInput = document.getElementById('levelInput');
      let maxLevel = null;
      if (levelInput) {
        const v = parseInt(levelInput.value, 10);
        if (!isNaN(v) && v >= 0) maxLevel = v;
      }

      if (maxLevel !== null) {
        // حذف كل من عمقه أكبر من maxLevel
        const allowedIds = new Set();
        this.nodes.forEach((node, id) => {
          if (node.depth <= maxLevel) allowedIds.add(id);
        });
        // حذف الأبناء غير المسموحين
        this.nodes.forEach((node) => {
          node.children = node.children.filter(cid => allowedIds.has(cid));
        });
        // حذف العقد غير المسموحة
        for (const id of Array.from(this.nodes.keys())) {
          if (!allowedIds.has(id)) this.nodes.delete(id);
        }
      }

      this.calcLeafCount(this.root);
      this.distributeWithBias();
      this.calculatePositions();
      this.resolveCollisionsAdvanced();
      this.updateStats();
    }

    buildNodes() {
      this.nodes.clear();
      if (!Array.isArray(window.DATA)) {
        console.error("DATA غير موجودة. تأكد أن data.js يتم تحميله قبل tree.js");
        return;
      }

      window.DATA.forEach((d) => {
        this.nodes.set(d.id, {
          id: d.id,
          fatherId: d.f,
          name: d.n,
          fullName: d.full || d.n,
          children: [],
          depth: 0,
          leafCount: 0,
          x: 0,
          y: 0,
          angle: 0,
          side: 0,
          inTrunk: false,
        });
      });

      this.nodes.forEach((node) => {
        if (node.fatherId) {
          const father = this.nodes.get(node.fatherId);
          if (father) father.children.push(node.id);
        } else {
          this.root = node.id;
        }
      });
    }

    calcDepth() {
      const queue = [{ id: this.root, d: 0 }];
      this.maxDepth = 0;

      while (queue.length) {
        const { id, d } = queue.shift();
        const node = this.nodes.get(id);
        if (!node) continue;
        node.depth = d;
        this.maxDepth = Math.max(this.maxDepth, d);
        node.children.forEach((cid) => queue.push({ id: cid, d: d + 1 }));
      }
    }

    calcLeafCount(id) {
      const node = this.nodes.get(id);
      if (!node) return 0;

      if (node.children.length === 0) {
        node.leafCount = 1;
        return 1;
      }
      let count = 0;
      node.children.forEach((cid) => {
        count += this.calcLeafCount(cid);
      });
      node.leafCount = count;
      return count;
    }

    distributeWithBias() {
      const rootNode = this.nodes.get(this.root);
      if (!rootNode) return;

      const primaryBranches = rootNode.children.map((id) => ({
        id,
        weight: this.nodes.get(id)?.leafCount || 1,
      }));

      primaryBranches.sort((a, b) => b.weight - a.weight);

      const bias = this.settings.rightBias / 100; // 0..1

      const left = [];
      const right = [];
      let leftW = 0;
      let rightW = 0;

      primaryBranches.forEach((branch) => {
        const total = leftW + rightW;
        const currentRightRatio = total > 0 ? rightW / total : 0.5;

        if (currentRightRatio < bias) {
          right.push(branch);
          rightW += branch.weight;
        } else {
          left.push(branch);
          leftW += branch.weight;
        }
      });

      this.leftWeight = leftW;
      this.rightWeight = rightW;

      this.assignSymmetricAngles(left, right);
    }

    assignSymmetricAngles(leftBranches, rightBranches) {
      const baseAngles = [25, 40, 55, 70, 85];

      leftBranches.forEach((branch, i) => {
        const node = this.nodes.get(branch.id);
        if (!node) return;

        const angleIdx = Math.min(i, baseAngles.length - 1);
        const angleDeg = -baseAngles[angleIdx];
        node.angle = (angleDeg * Math.PI) / 180;
        node.side = -1;

        this.assignChildAngles(branch.id, angleDeg, this.settings.angleSpread, -1);
      });

      rightBranches.forEach((branch, i) => {
        const node = this.nodes.get(branch.id);
        if (!node) return;

        const angleIdx = Math.min(i, baseAngles.length - 1);
        const angleDeg = baseAngles[angleIdx];
        node.angle = (angleDeg * Math.PI) / 180;
        node.side = 1;

        this.assignChildAngles(branch.id, angleDeg, this.settings.angleSpread, 1);
      });
    }

    assignChildAngles(parentId, centerAngle, spread, side) {
      const parent = this.nodes.get(parentId);
      if (!parent || parent.children.length === 0) return;

      const weights = parent.children.map((id) => this.nodes.get(id)?.leafCount || 1);
      const totalW = weights.reduce((a, b) => a + b, 0);

      let currentAngle = centerAngle - spread / 2;

      parent.children.forEach((childId, i) => {
        const child = this.nodes.get(childId);
        if (!child) return;

        const w = weights[i] / totalW;
        const childAngle = currentAngle + (spread * w) / 2;

        child.angle = (childAngle * Math.PI) / 180;
        child.side = side;

        currentAngle += spread * w;

        this.assignChildAngles(childId, childAngle, spread * w * 0.6, side);
      });
    }

    calculatePositions() {
      const rootNode = this.nodes.get(this.root);
      if (!rootNode) return;

      const trunkTopY = this.groundY - this.settings.trunkHeight;

      // Root (الجد) — مثبت على X عند الجذع
      if (!this.customPositions.has(this.root)) {
        rootNode.x = this.trunkX;
        rootNode.y = trunkTopY - 5;
      } else {
        const custom = this.customPositions.get(this.root);
        rootNode.x = this.trunkX; // قيد X
        rootNode.y = custom.y;
      }
      rootNode.inTrunk = false;

      // حالة الابن الوحيد: يدخل في الجذع أيضاً
      if (rootNode.children.length === 1) {
        const onlyChild = this.nodes.get(rootNode.children[0]);
        if (onlyChild) {
          if (!this.customPositions.has(onlyChild.id)) {
            onlyChild.x = this.trunkX;
            onlyChild.y = trunkTopY - 50;
          } else {
            const custom = this.customPositions.get(onlyChild.id);
            onlyChild.x = this.trunkX; // قيد X
            onlyChild.y = custom.y;
          }
          onlyChild.inTrunk = true;
        }
      }

      // باقي العقد
      this.nodes.forEach((node, id) => {
        if (id === this.root) return;
        if (node.inTrunk) return;

        // موضع مخصص
        if (this.customPositions.has(id)) {
          const customPos = this.customPositions.get(id);

          // قيود للجيل 1
          if (node.depth === 1) {
            const maxDist = 150;
            const dist = Math.abs(customPos.x - this.trunkX);
            node.x = dist > maxDist
              ? this.trunkX + (customPos.x > this.trunkX ? maxDist : -maxDist)
              : customPos.x;
            node.y = customPos.y;
          } else {
            node.x = customPos.x;
            node.y = customPos.y;
          }
          return;
        }

        const depthRatio = node.depth / this.maxDepth;
        const r = 120 + Math.pow(depthRatio, 1.2) * 500;

        node.x = this.trunkX + r * Math.sin(node.angle);
        node.y = trunkTopY - r * Math.abs(Math.cos(node.angle)) * 0.8;
      });
    }

    // ─────────────────────────────────────────────────────────
    // Collision + geometry
    // ─────────────────────────────────────────────────────────
    resolveCollisionsAdvanced() {
      const minDist = this.settings.spacing;
      const iterations = 150;
      const branchMinDist = minDist * 0.8;

      for (let iter = 0; iter < iterations; iter++) {
        let moved = false;

        // العقد المحمية = كل موضع مخصص
        const protectedNodes = new Set(this.customPositions.keys());

        // منع تقاطع الفروع
        const branches = this.getAllBranches();
        for (let i = 0; i < branches.length; i++) {
          for (let j = i + 1; j < branches.length; j++) {
            const b1 = branches[i];
            const b2 = branches[j];

            // تخطي لو الطرفين محميين
            if (protectedNodes.has(b1.nodeId) || protectedNodes.has(b2.nodeId)) continue;

            const dist = this.segmentDistance(b1.from, b1.to, b2.from, b2.to);

            if (dist < branchMinDist) {
              const dx = b1.to.x - b2.to.x;
              const dy = b1.to.y - b2.to.y;
              const d = Math.sqrt(dx * dx + dy * dy);

              if (d > 0 && d < minDist * 1.5) {
                const push = (minDist * 1.5 - d) / 2;
                const px = (dx / d) * push;
                const py = (dy / d) * push;

                if (!protectedNodes.has(b1.nodeId)) {
                  b1.to.x += px * 0.9;
                  b1.to.y += py * 0.3; // أفقي أكثر
                }
                if (!protectedNodes.has(b2.nodeId)) {
                  b2.to.x -= px * 0.9;
                  b2.to.y -= py * 0.3;
                }

                moved = true;
              }
            }
          }
        }

        // منع تداخل الأوراق (node-node)
        this.nodes.forEach((a, idA) => {
          if (idA === this.root || a.inTrunk) return;
          if (protectedNodes.has(idA)) return;

          this.nodes.forEach((b, idB) => {
            if (idA >= idB || idB === this.root || b.inTrunk) return;
            if (protectedNodes.has(idB)) return;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDist && dist > 0) {
              const push = (minDist - dist) / 2;
              const px = (dx / dist) * push;
              const py = (dy / dist) * push;

              a.x -= px * 0.8;
              a.y -= py * 0.6;

              b.x += px * 0.8;
              b.y += py * 0.6;

              moved = true;
            }
          });
        });

        if (!moved && iter > 50) break;
      }
    }

    getAllBranches() {
      const branches = [];
      this.nodes.forEach((node, id) => {
        if (id === this.root) return;
        const father = this.nodes.get(node.fatherId);
        if (!father) return;

        branches.push({
          from: { x: father.x, y: father.y },
          to: { x: node.x, y: node.y },
          nodeId: id,
        });
      });
      return branches;
    }

    segmentDistance(p1, p2, p3, p4) {
      // أقرب مسافة بين خطين
      const dx1 = p2.x - p1.x;
      const dy1 = p2.y - p1.y;
      const dx2 = p4.x - p3.x;
      const dy2 = p4.y - p3.y;

      const dx3 = p3.x - p1.x;
      const dy3 = p3.y - p1.y;

      const d = dx1 * dy2 - dy1 * dx2;

      if (Math.abs(d) < 0.001) {
        // متوازية
        return this.pointToSegmentDistance(p3, p1, p2);
      }

      const t1 = (dx3 * dy2 - dy3 * dx2) / d;
      const t2 = (dx3 * dy1 - dy3 * dx1) / d;

      if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
        const ix = p1.x + t1 * dx1;
        const iy = p1.y + t1 * dy1;
        const jx = p3.x + t2 * dx2;
        const jy = p3.y + t2 * dy2;
        return Math.sqrt((ix - jx) ** 2 + (iy - jy) ** 2);
      }

      return Math.min(
        this.pointToSegmentDistance(p3, p1, p2),
        this.pointToSegmentDistance(p4, p1, p2),
        this.pointToSegmentDistance(p1, p3, p4),
        this.pointToSegmentDistance(p2, p3, p4)
      );
    }

    pointToSegmentDistance(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;

      if (l2 === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);

      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
      t = Math.max(0, Math.min(1, t));

      const px = a.x + t * dx;
      const py = a.y + t * dy;

      return Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2);
    }

    // ─────────────────────────────────────────────────────────
    // Stats + settings code
    // ─────────────────────────────────────────────────────────
    updateStats() {
      const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
      };
      setText("members", this.nodes.size);
      setText("gens", this.maxDepth + 1);
      setText("leftW", this.leftWeight || 0);
      setText("rightW", this.rightWeight || 0);

      const diff = Math.abs((this.leftWeight || 0) - (this.rightWeight || 0));
      const maxW = Math.max(this.leftWeight || 0, this.rightWeight || 0);
      const balancePercent = maxW > 0 ? (diff / maxW * 100).toFixed(1) : "0";

      const balanceEl = document.getElementById("balance");
      if (balanceEl) {
        balanceEl.textContent = balancePercent + "%";
        balanceEl.className = "stat-value " + (parseFloat(balancePercent) < 10 ? "good" : "warning");
      }
    }

    updateSettingsCode() {
      const pre = document.getElementById("settingsCode");
      if (!pre) return;

      const s = this.settings;

      const code = `{
  // ═══════════════════════════════════════════
  // إعدادات شجرة العائلة
  // ═══════════════════════════════════════════

  // 1) الأحجام
  "leafSize": ${s.leafSize},
  "fontSize": ${s.fontSize},
  "spacing": ${s.spacing},

  // 2) التوزيع
  "rightBias": ${s.rightBias},
  "angleSpread": ${s.angleSpread},

  // 3) الجذع
  "trunkWidth": ${s.trunkWidth},
  "trunkHeight": ${s.trunkHeight},

  // 4) الفروع
  "branchThickness": ${s.branchThickness},
  "gravity": ${s.gravity},

  // 5) الألوان
  "leafColors": {
    "c1": "${s.leafColors.c1}",
    "c2": "${s.leafColors.c2}",
    "c3": "${s.leafColors.c3}",
    "c4": "${s.leafColors.c4}"
  },
  "rootColor": "${s.rootColor}",
  "branchColor": "${s.branchColor}",
  "nodeColor": "${s.nodeColor}",
  "textColor": "${s.textColor}"
}`;

      pre.textContent = code;
    }

    copySettings() {
      const pre = document.getElementById("settingsCode");
      if (!pre) return;
      navigator.clipboard?.writeText(pre.textContent || "").then(
        () => alert("تم نسخ الإعدادات ✅"),
        () => alert("تعذر النسخ. انسخ يدويًا.")
      );
    }

    // ─────────────────────────────────────────────────────────
    // Public actions (buttons)
    // ─────────────────────────────────────────────────────────
    toggleAxis() {
      this.showAxis = !this.showAxis;
      const btn = document.getElementById("axisBtn");
      if (btn) {
        btn.classList.toggle("active");
        btn.textContent = this.showAxis ? "إخفاء المحور" : "إظهار المحور";
      }
      this.draw();
    }

    zoom(factor) {
      this.scale *= factor;
      this.scale = Math.max(0.3, Math.min(3, this.scale));
      this.draw();
    }

    reset() {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.draw();
    }

    rebuild() {
      this.build();
      this.draw();
    }

    resetCustomPositions() {
      if (this.customPositions.size > 0) {
        const count = this.customPositions.size;
        this.customPositions.clear();
        console.log(`🔄 تم إعادة ضبط ${count} موضع مخصص`);
        this.rebuild();
        alert(`تم إعادة ضبط ${count} موضع مخصص إلى المواضع الافتراضية`);
      } else {
        alert("لا يوجد مواضع مخصصة لإعادة ضبطها");
      }
    }

    resetDefaults() {
      this.settings = {
        leafSize: 13,
        fontSize: 9,
        spacing: 90,
        angleSpread: 40,
        trunkWidth: 90,
        trunkHeight: 300,
        branchThickness: 1.0,
        gravity: 4,
        rightBias: 50,
        leafColors: {
          c1: "#C8E6C9",
          c2: "#A5D6A7",
          c3: "#81C784",
          c4: "#66BB6A",
        },
        rootColor: "#8B4513",
        branchColor: "#D4AF37",
        nodeColor: "#FF6B6B",
        textColor: "#FFFFFF",
      };

      // Sync UI inputs if exist
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      };
      setVal("rightBias", 50);
      setVal("leafSize", 13);
      setVal("fontSize", 9);
      setVal("spacing", 90);
      setVal("trunkWidth", 90);
      setVal("trunkHeight", 300);
      setVal("branchThickness", 1.0);
      setVal("gravity", 4);

      setVal("leafColor1", "#C8E6C9");
      setVal("leafColor2", "#A5D6A7");
      setVal("leafColor3", "#81C784");
      setVal("leafColor4", "#66BB6A");

      setVal("rootColor", "#8B4513");
      setVal("branchColor", "#D4AF37");
      setVal("nodeColor", "#FF6B6B");
      setVal("textColor", "#FFFFFF");

      const setText = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
      };
      setText("rightBiasValue", "50%");
      setText("leafSizeValue", "13");
      setText("fontSizeValue", "9px");
      setText("spacingValue", "90px");
      setText("trunkWidthValue", "90px");
      setText("trunkHeightValue", "300px");
      setText("branchThicknessValue", "1.0x");
      setText("gravityValue", "4x");

      this.rebuild();
      this.updateSettingsCode();
    }

    exportImage() {
      const link = document.createElement("a");
      link.download = "family-tree.png";
      link.href = this.canvas.toDataURL("image/png");
      link.click();
    }

    // ─────────────────────────────────────────────────────────
    // Interaction
    // ─────────────────────────────────────────────────────────
    setupEvents() {
      const canvas = this.canvas;

      // Mouse move (hover / drag node / pan)
      canvas.addEventListener("mousemove", (e) => {
        const p = this.toWorld(e.clientX, e.clientY);

        if (this.draggedNode) {
          // Drag node
          const dx = p.x - this.dragPointerStart.x;
          const dy = p.y - this.dragPointerStart.y;

          let nx = this.draggedNodeStart.x + dx;
          let ny = this.draggedNodeStart.y + dy;

          // قيود: الجد (depth 0) و inTrunk (تثبيت X على الجذع)
          if (this.draggedNode.depth === 0 || this.draggedNode.inTrunk) {
            nx = this.trunkX;
          }

          // قيود: الجيل 1 (±150 من الجذع)
          if (this.draggedNode.depth === 1 && !this.draggedNode.inTrunk) {
            const maxDist = 150;
            const dist = nx - this.trunkX;
            if (Math.abs(dist) > maxDist) {
              nx = this.trunkX + (dist > 0 ? maxDist : -maxDist);
            }
          }

          // Save custom pos
          this.customPositions.set(this.draggedNode.id, { x: nx, y: ny });

          // Apply immediately
          this.draggedNode.x = nx;
          this.draggedNode.y = ny;

          this.draw();
          return;
        }

        if (this.draggingPan) {
          const dx = e.clientX - this.dragStart.x;
          const dy = e.clientY - this.dragStart.y;
          this.offsetX = this.panStart.x + dx;
          this.offsetY = this.panStart.y + dy;
          this.draw();
          return;
        }

        // Hover detection
        const hit = this.findNodeAt(p.x, p.y);
        if (hit !== this.hoveredNode) {
          this.hoveredNode = hit;
          if (hit) this.showTooltip(e, hit);
          else this.hideTooltip();
          this.draw();
        } else {
          // Update tooltip position while hovering
          if (hit) this.showTooltip(e, hit);
        }
      });

      canvas.addEventListener("mouseleave", () => {
        if (!this.draggedNode) {
          this.hoveredNode = null;
          this.hideTooltip();
          this.draw();
        }
      });

      // Pan start
      canvas.addEventListener("mousedown", (e) => {
        // Left click only
        if (e.button !== 0) return;

        const p = this.toWorld(e.clientX, e.clientY);
        const hit = this.findNodeAt(p.x, p.y);

        // Single click - start pan (unless node dragging mode is on)
        if (!this.draggedNode && !hit) {
          this.draggingPan = true;
          this.dragStart = { x: e.clientX, y: e.clientY };
          this.panStart = { x: this.offsetX, y: this.offsetY };
        }
      });

      // Stop pan / stop node drag
      window.addEventListener("mouseup", () => {
        this.draggingPan = false;

        if (this.draggedNode) {
          // After releasing node: rebuild only collisions lightly
          this.draggedNode = null;
          this.canvas.classList.remove("dragging-node");
          this.updateSettingsCode();
          // (اختياري) إعادة حل تصادمات بعد التحريك
          this.resolveCollisionsAdvanced();
          this.updateStats();
          this.draw();
        }
      });

      // Double click to enable node dragging
      canvas.addEventListener("dblclick", (e) => {
        const p = this.toWorld(e.clientX, e.clientY);
        const hit = this.findNodeAt(p.x, p.y);
        if (!hit) return;

        this.draggedNode = hit;
        this.draggedNodeStart = { x: hit.x, y: hit.y };
        this.dragPointerStart = { x: p.x, y: p.y };
        this.canvas.classList.add("dragging-node");
      });

      // Fallback double-click detection (لو بعض المتصفحات تمنع dblclick على canvas)
      canvas.addEventListener("click", (e) => {
        const now = Date.now();
        const p = this.toWorld(e.clientX, e.clientY);
        const hit = this.findNodeAt(p.x, p.y);

        if (hit && this.lastClickNode && hit.id === this.lastClickNode.id && (now - this.lastClickTime) < 300) {
          // treat as dblclick
          this.draggedNode = hit;
          this.draggedNodeStart = { x: hit.x, y: hit.y };
          this.dragPointerStart = { x: p.x, y: p.y };
          this.canvas.classList.add("dragging-node");
        }

        this.lastClickTime = now;
        this.lastClickNode = hit;
      });

      // Wheel zoom
      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const old = this.scale;
        this.scale *= e.deltaY > 0 ? 0.9 : 1.1;
        this.scale = Math.max(0.3, Math.min(3, this.scale));

        // Zoom towards cursor (nice feel)
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const wxBefore = (cx - this.offsetX) / old;
        const wyBefore = (cy - this.offsetY) / old;

        const wxAfter = (cx - this.offsetX) / this.scale;
        const wyAfter = (cy - this.offsetY) / this.scale;

        this.offsetX += (wxAfter - wxBefore) * this.scale;
        this.offsetY += (wyAfter - wyBefore) * this.scale;

        this.draw();
      }, { passive: false });

      // Resize
      window.addEventListener("resize", () => {
        this.resize();
        this.rebuild();
        this.draw();
      });
    }

    showTooltip(e, node) {
      const tt = document.getElementById("tooltip");
      if (!tt) return;

      const isCustom = this.customPositions.has(node.id);

      let restrictionText = "";
      if (node.depth === 0) {
        restrictionText = '<p style="color:#2196F3;font-size:0.85em;">🔒 مثبت في الجذع (محور X)</p>';
      } else if (node.depth === 1 && node.inTrunk) {
        restrictionText = '<p style="color:#2196F3;font-size:0.85em;">🔒 مثبت في الجذع (محور X)</p>';
      } else if (node.depth === 1) {
        restrictionText = '<p style="color:#2196F3;font-size:0.85em;">⚠️ مقيد: ±150 بكسل من الجذع</p>';
      }

      tt.innerHTML = `
        <h3>${node.name}</h3>
        <p><strong>الاسم:</strong> ${node.fullName}</p>
        <p><strong>الجيل:</strong> ${node.depth + 1}</p>
        <p><strong>الجهة:</strong> ${node.side === -1 ? "يسار" : node.side === 1 ? "يمين" : "وسط"}</p>
        <p><strong>الأبناء:</strong> ${node.children.length}</p>
        ${isCustom ? '<p style="color:#4CAF50;font-weight:bold;">✓ موضع مخصص</p>' : ""}
        ${restrictionText}
        <p style="color:#F57C00;margin-top:8px;">💡 انقر مرتين للتحريك</p>
      `;

      tt.style.display = "block";
      tt.style.left = Math.min(e.clientX + 15, window.innerWidth - 320) + "px";
      tt.style.top = Math.min(e.clientY + 15, window.innerHeight - 240) + "px";
    }

    hideTooltip() {
      const tt = document.getElementById("tooltip");
      if (tt) tt.style.display = "none";
    }

    findNodeAt(x, y) {
      let hit = null;
      const r = this.settings.leafSize + 4;

      this.nodes.forEach((node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r) hit = node;
      });

      return hit;
    }

    toWorld(clientX, clientY) {
      // Convert screen -> world (taking scale & offset)
      const rect = this.canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;

      return {
        x: (sx - this.offsetX) / this.scale,
        y: (sy - this.offsetY) / this.scale,
      };
    }

    // ─────────────────────────────────────────────────────────
    // Rendering
    // ─────────────────────────────────────────────────────────
    draw() {
      const ctx = this.ctx;

      // Clear
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Apply camera transform
      ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);

      // Background
      this.drawBackground();

      // Optional axis
      if (this.showAxis) this.drawAxis();

      // Tree
      this.trunkX = this.canvas.width / 2; // keep centered in screen-space concept
      // BUT: because we use transform, trunkX should be world coord, so use canvas width/2 in world:
      // The simplest: keep trunkX as world coords based on initial width:
      // We'll set it in resize/build. Here don't override.

      this.drawTrunk();
      this.drawBranches();
      this.drawNodes();
    }

    drawBackground() {
      const ctx = this.ctx;

      // Sky/ground gradient (خفيف)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      skyGrad.addColorStop(0, "#87CEEB");
      skyGrad.addColorStop(0.55, "#87CEEB");
      skyGrad.addColorStop(0.7, "#B8E6B8");
      skyGrad.addColorStop(0.8, "#90EE90");
      skyGrad.addColorStop(1, "#8B7355");

      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Ground line subtle
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = "#2E7D32";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, this.groundY);
      ctx.lineTo(this.canvas.width, this.groundY);
      ctx.stroke();
      ctx.restore();

      // Small grass dots
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#2E7D32";
      for (let i = 0; i < 300; i++) {
        const x = Math.random() * this.canvas.width;
        const y = this.groundY + Math.random() * (this.canvas.height - this.groundY);
        const s = Math.random() * 3 + 1;
        ctx.fillRect(x, y, s, s);
      }
      ctx.restore();

      // Shadow under trunk
      const shadowGrad = ctx.createRadialGradient(
        this.trunkX, this.groundY + 10, 0,
        this.trunkX, this.groundY + 10, 250
      );
      shadowGrad.addColorStop(0, "rgba(0,0,0,0.25)");
      shadowGrad.addColorStop(0.3, "rgba(0,0,0,0.15)");
      shadowGrad.addColorStop(0.6, "rgba(0,0,0,0.05)");
      shadowGrad.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(this.trunkX, this.groundY + 10, 250, 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    drawAxis() {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;

      // X axis
      ctx.beginPath();
      ctx.moveTo(-5000, this.groundY);
      ctx.lineTo(5000, this.groundY);
      ctx.stroke();

      // Trunk vertical
      ctx.beginPath();
      ctx.moveTo(this.trunkX, -5000);
      ctx.lineTo(this.trunkX, 5000);
      ctx.stroke();

      ctx.restore();
    }

    // ─────────────────────────────────────────────────────────
    // Trunk (with simple procedural bark)
    // ─────────────────────────────────────────────────────────
    hash2(x, y) {
      let n = x * 374761393 + y * 668265263;
      n = (n ^ (n >> 13)) * 1274126177;
      return ((n ^ (n >> 16)) >>> 0) / 4294967295;
    }

    noise2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);

      const n00 = this.hash2(xi, yi);
      const n10 = this.hash2(xi + 1, yi);
      const n01 = this.hash2(xi, yi + 1);
      const n11 = this.hash2(xi + 1, yi + 1);

      return this.lerp(this.lerp(n00, n10, u), this.lerp(n01, n11, u), v);
    }

    lerp(a, b, t) {
      return a + (b - a) * t;
    }

    fbm(x, y, oct = 5) {
      let f = 1, a = 0.5, s = 0;
      for (let i = 0; i < oct; i++) {
        s += a * this.noise2(x * f, y * f);
        f *= 2;
        a *= 0.5;
      }
      return s;
    }

    trunkCenterX(y) {
      return 6.0 * Math.sin(0.012 * y) + 2.1 * Math.sin(0.0044 * y + 1.4);
    }

    trunkRadiusPro(y) {
      const H = this.settings.trunkHeight;
      const t = Math.max(0, Math.min(1, y / H));
      const baseR = this.settings.trunkWidth / 2;

      // Leonardo-ish taper
      let r = baseR * Math.pow(1 - t, 0.55) + 6;

      // base flare
      r *= (1 + 0.6 * Math.exp(-y / 50));

      // bulge before branching
      const bulge = Math.exp(-Math.pow((t - 0.62) / 0.10, 2)) * 0.15;
      r *= (1 + bulge);

      return r;
    }

    barkColorAt(x, y) {
      const n = this.fbm(x * 0.025, y * 0.025, 5);
      const grain = (n - 0.5) * 0.50;

      const baseR = 108, baseG = 70, baseB = 45;
      const h = Math.max(-0.25, Math.min(0.35, x * 0.003 + 0.18));

      const v = Math.max(0.45, Math.min(1.15, 0.85 + grain + h));
      const r = Math.max(0, Math.min(255, baseR * v));
      const g = Math.max(0, Math.min(255, baseG * v));
      const b = Math.max(0, Math.min(255, baseB * v));

      return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    }

    drawTrunk() {
      const ctx = this.ctx;
      const baseY = this.groundY;
      const topY = this.groundY - this.settings.trunkHeight;

      // Build trunk path samples
      const N = 60;
      const path = [];

      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const yLocal = t * this.settings.trunkHeight;
        const xOff = this.trunkCenterX(yLocal);
        path.push({
          x: this.trunkX + xOff,
          y: baseY - yLocal,
          yLocal
        });
      }

      // Fill trunk with strips (procedural bark)
      for (let i = 0; i < path.length - 1; i++) {
        const p = path[i];
        const r = this.trunkRadiusPro(p.yLocal);

        // small strip
        ctx.save();
        ctx.fillStyle = this.barkColorAt(p.x - this.trunkX, p.yLocal);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // trunk highlight (subtle)
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(this.trunkX - this.settings.trunkWidth * 0.15, baseY);
      ctx.bezierCurveTo(
        this.trunkX - this.settings.trunkWidth * 0.25, baseY - this.settings.trunkHeight * 0.35,
        this.trunkX - this.settings.trunkWidth * 0.10, baseY - this.settings.trunkHeight * 0.65,
        this.trunkX - this.settings.trunkWidth * 0.18, topY
      );
      ctx.stroke();
      ctx.restore();

      // Root cap near top to connect branches
      ctx.save();
      ctx.fillStyle = this.settings.rootColor;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(this.trunkX, topY, this.settings.trunkWidth * 0.35, this.settings.trunkWidth * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // direct shadow under trunk (small)
      const directShadow = ctx.createRadialGradient(
        this.trunkX, this.groundY + 5, 0,
        this.trunkX, this.groundY + 5, this.settings.trunkWidth
      );
      directShadow.addColorStop(0, "rgba(0,0,0,0.35)");
      directShadow.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = directShadow;
      ctx.beginPath();
      ctx.ellipse(
        this.trunkX,
        this.groundY + 5,
        this.settings.trunkWidth,
        this.settings.trunkWidth * 0.3,
        0, 0, Math.PI * 2
      );
      ctx.fill();
    }

   drawBranches() {
  const ctx = this.ctx;

  ctx.save();
  ctx.strokeStyle = this.settings.branchColor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  this.nodes.forEach((node, id) => {
    if (id === this.root) return;
    const father = this.nodes.get(node.fatherId);
    if (!father) return;

    // ✅ سماكة تدريجية حسب العمق (تدرج قوي وواضح)
    const t = node.depth / (this.maxDepth + 1);          // 0..1
    const depthFactor = Math.pow(1 - t, 0.5);            // taper أقوى

    // ✅ دعم إضافي للسماكة حسب حجم الفرع (leafCount)
    const wFactor = Math.pow((node.leafCount || 1), 0.22);

    // السماكة النهائية
    const minW = 0.8;                                   // لا تنزل أقل من كذا
    const baseW = 10 * this.settings.branchThickness;    // أساس الفروع الكبيرة
    const w = Math.max(minW, baseW * depthFactor * wFactor);

    ctx.lineWidth = w;

    // ✅ انحناء الفروع
    const g = this.settings.gravity;
    const mx = (father.x + node.x) / 2;
    const my = (father.y + node.y) / 2 + g * 6;

    ctx.beginPath();
    ctx.moveTo(father.x, father.y);
    ctx.quadraticCurveTo(mx, my, node.x, node.y);
    ctx.stroke();
  });

  ctx.restore();
}


    drawNodes() {
      const ctx = this.ctx;
      const r = this.settings.leafSize;

      // Draw nodes (leaves)
      this.nodes.forEach((node, id) => {
        // Pick color tier by depth
        let fill = this.settings.leafColors.c3;
        if (node.depth <= 1) fill = this.settings.leafColors.c4;
        else if (node.depth <= 2) fill = this.settings.leafColors.c3;
        else if (node.depth <= 4) fill = this.settings.leafColors.c2;
        else fill = this.settings.leafColors.c1;

        // Root special color
        if (id === this.root) fill = this.settings.rootColor;

        // Hover highlight
        const isHover = this.hoveredNode && this.hoveredNode.id === id;

        ctx.save();

        // leaf shape (ellipse)
        ctx.fillStyle = fill;
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = isHover ? 3 : 1;

        ctx.beginPath();
        ctx.ellipse(node.x, node.y, r * 1.2, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // node dot (center)
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = this.settings.nodeColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(2, r * 0.18), 0, Math.PI * 2);
        ctx.fill();

        // Text
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.settings.textColor;
        ctx.font = `bold ${this.settings.fontSize}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const name = node.name;
        ctx.fillText(name, node.x, node.y);

        // custom marker
        if (this.customPositions.has(id)) {
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = "#2E7D32";
          ctx.beginPath();
          ctx.arc(node.x + r * 1.1, node.y - r * 0.9, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });
    }
  }


  // Expose globally for buttons (onclick="app.reset()" etc)
  window.AdvancedTree = AdvancedTree;
  window.app = new AdvancedTree({ canvasId: "canvas" });
  // دالة عمومية لإعادة بناء الشجرة بعد تغيير البيانات
  window.rebuildTree = function() {
    if (window.app) window.app.rebuild();
  };

})();
