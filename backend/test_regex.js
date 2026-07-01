const text = "EXPIRY DATE19 / 0 6 / 2 0 3 3  OTHER TEXT 15AUG1995";
const spaceStripped = text.replace(/\s+/g, "");
const datePatBNoSpaces = /(?:^|[^0-9])(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4})(?=$|[^0-9])/g;

let dm;
const dateHits = new Set();
while ((dm = datePatBNoSpaces.exec(spaceStripped)) !== null) {
  dateHits.add(dm[1]);
}
console.log(dateHits);
