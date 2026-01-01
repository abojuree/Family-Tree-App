let app;
window.onload = () => {
  app = new AdvancedTree();

window.rebuildTree = function () {
  // أي طريقة عندك لإعادة الرسم:
  // 1) امسح الكانفس/الـsvg
  // 2) نادِ دالة build الحالية في tree.js
  // مثال (عدله حسب مشروعك):
  if (typeof drawTree === "function") drawTree(window.DATA);
};

};
