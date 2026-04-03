try {
  const { fabric } = require("fabric");
  console.log(typeof fabric.Image.fromURL);
} catch (e) {
  console.error("ERROR", e);
}
