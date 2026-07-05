import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "Do I need to change my application code?",
    a: "Only the base URL and the token. Point your existing SDK or HTTP client at the gateway's /proxy path and use your proxy token in the Authorization header instead of the real key — the request shape stays the same, including streaming responses.",
  },
  {
    q: "What happens if I revoke a token?",
    a: "It stops working immediately. There's no cache window — the very next request with that token is rejected.",
  },
  {
    q: "Can I use this with a provider that isn't OpenAI or Anthropic?",
    a: "Yes. Choose \"Custom\" when adding an API and point it at any base URL. The gateway forwards the path, method, and body, and injects your stored key.",
  },
  {
    q: "Where are my API keys stored?",
    a: "Encrypted at rest in the database. The plaintext key only ever exists in memory for the moment it's decrypted to inject into an outgoing request — it's never logged.",
  },
  {
    q: "Does streaming still work through the proxy?",
    a: "Yes. Server-sent event streams are relayed chunk by chunk as they arrive from the upstream provider, with usage metrics captured once the stream completes.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            Frequently asked questions
          </h2>
        </div>
        <Accordion className="w-full">
          {FAQS.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i}`}>
              <AccordionTrigger className="text-left font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
