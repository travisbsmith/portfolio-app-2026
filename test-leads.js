import { createClient } from "@vercel/kv";

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function run() {
  try {
    const data = await kv.get('leads');
    console.log("Type of leads:", typeof data);
    console.log("Is array?", Array.isArray(data));
    if (data) {
      console.log("Length of leads:", data.length);
    }
    
    // Attempt a minimal patch
    if (Array.isArray(data)) {
      console.log("Attempting to write leads back...");
      await kv.set('leads', data);
      console.log("Wrote leads back successfully");
    } else if (typeof data === 'string') {
      const parsed = JSON.parse(data);
      console.log("Parsed from string, is array?", Array.isArray(parsed));
      console.log("Writing back stringified leads...");
      await kv.set('leads', parsed);
      console.log("Wrote leads back successfully");
    }
  } catch (err) {
    console.error("KV Error:", err.message);
  }
}
run();
