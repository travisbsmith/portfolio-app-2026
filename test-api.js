import { updateLead } from "./src/lib/leads.js";
import { getLeads } from "./src/lib/leads.js";

async function run() {
  try {
    const leads = await getLeads();
    console.log("Found leads length:", leads.length);
    if (leads.length === 0) return console.log("No leads to test");
    const lead = leads[0];
    
    console.log("Testing updateLead for:", lead.id);
    const entry = {
      id: 'act_' + Date.now(),
      type: 'Note',
      text: 'Test note from debug script',
      createdAt: new Date().toISOString()
    };
    
    const updated = await updateLead(lead.id, {
      activityLog: [entry, ...(lead.activityLog ?? [])]
    });
    
    console.log("Updated lead:", updated ? "SUCCESS" : "FAILED");
    if (updated) {
      console.log("First activity note text:", updated.activityLog[0].text);
    }
  } catch (err) {
    console.error("DEBUG ERROR:", err);
  }
}
run();
