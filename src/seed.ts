import { createProject, createScan } from "./services/project-service";

export const seedData = (): void => {
  const project = createProject({
    name: "demo-commerce-app",
    description: "Seeded project for immediate API exploration."
  });

  createScan(project.id, [
    {
      file: "src/checkout.ts",
      line: 47,
      method: "GET",
      url: "/api/users/:id",
      library: "axios",
      frequency: "per-request"
    },
    {
      file: "src/checkout.ts",
      line: 52,
      method: "GET",
      url: "/api/users/:id/preferences",
      library: "axios",
      frequency: "per-request"
    },
    {
      file: "src/payments/stripe.ts",
      line: 18,
      method: "POST",
      url: "https://api.stripe.com/v1/payment_intents",
      library: "fetch",
      frequency: "250/day"
    },
    {
      file: "src/notifications/email.ts",
      line: 34,
      method: "POST",
      url: "https://api.sendgrid.com/v3/mail/send",
      library: "axios",
      frequency: "500/day"
    },
    {
      file: "src/ai/assistant.ts",
      line: 26,
      method: "POST",
      url: "https://api.openai.com/v1/responses",
      library: "fetch",
      frequency: "per-session"
    }
  ]);
};

