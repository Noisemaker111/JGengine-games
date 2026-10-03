import { validateCrossingContent } from "../src/game/contentValidation";

const issues = validateCrossingContent();
console.log(JSON.stringify({ game: "Wayfarer Deck", issues }, null, 2));
process.exitCode = issues.some(issue => issue.severity === "error") ? 1 : 0;
