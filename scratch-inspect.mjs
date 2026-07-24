import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("./scratch-bbf.xlsx");
wb.worksheets.forEach((ws) => console.log("Sheet:", ws.name, "rows:", ws.rowCount));
const ws = wb.worksheets[0];
console.log("HEADER:", JSON.stringify(ws.getRow(1).values));
console.log("ROW2:", JSON.stringify(ws.getRow(2).values));
console.log("ROW3:", JSON.stringify(ws.getRow(3).values));
