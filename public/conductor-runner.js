// Do not apply a response from a request scoped to a brand that is no longer active.
export async function applyBrandScopedResponse(requestBrandId, getActiveBrandId, response, apply, reload) {
  if (getActiveBrandId() !== requestBrandId) {
    await reload();
    return false;
  }
  apply(response);
  return true;
}

// Jalankan hanya agen yang benar-benar ada di katalog; status tiap langkah mengikuti hasil aktual.
export async function executeConductorPlan(steps, agents, run, onUpdate = () => {}, isCurrent = () => true) {
  const rows = (Array.isArray(steps) ? steps : []).slice(0, 5).map((step) => ({
    agent: step?.agent, values: step?.values && typeof step.values === 'object' && !Array.isArray(step.values) ? step.values : {}, status: 'pending',
  }));
  const update = () => onUpdate(rows.map((r) => ({ ...r })));
  update();
  for (const row of rows) {
    if (!isCurrent()) { row.status = 'cancelled'; update(); continue; }
    const agent = agents[row.agent];
    if (!agent) { row.status = 'failed'; row.error = 'Agen tidak dikenal'; update(); continue; }
    const missing = agent.fields.filter((f) => f.req && !String(row.values[f.k] ?? '').trim()).map((f) => f.label);
    if (missing.length) { row.status = 'needs_input'; row.missing = missing; update(); continue; }
    row.status = 'running'; update();
    try { row.text = await run(row.agent, row.values); row.status = 'done'; }
    catch (err) { row.status = 'failed'; row.error = err?.message || String(err); }
    update();
  }
  return rows;
}
