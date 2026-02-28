import { app } from "./app";
import { seedData } from "./seed";

const PORT = Number(process.env.PORT ?? 3000);

seedData();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API Usage Analyzer listening on http://localhost:${PORT}`);
});

