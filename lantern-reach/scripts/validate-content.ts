import { validateLanternContent } from "../src/game/contentValidation";

const issues = validateLanternContent();
console.log(JSON.stringify({ game: "Lantern Reach", issues }, null, 2));
process.exitCode = issues.some(issue => issue.severity === "error") ? 1 : 0;
