import fs from "node:fs";

const p = "e:/dev/grantdesk/src/routes/design-system.tsx";
let c = fs.readFileSync(p, "utf-8");
c = c.replace("@ts-ignore", "@ts-expect-error");
fs.writeFileSync(p, c, "utf-8");
console.log("Updated @ts-ignore to @ts-expect-error!");
