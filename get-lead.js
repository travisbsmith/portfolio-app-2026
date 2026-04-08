import { getLeads } from './src/lib/leads.js';
getLeads().then(l => console.log(l[0].id));
