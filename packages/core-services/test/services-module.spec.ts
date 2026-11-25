import { describe, expect, it } from 'vitest';
import { createServicesModule } from '../src/index.js';

describe('createServicesModule facade', () => {
  it('wires service order repository, quote recording, and status transitions', async () => {
    const mod = createServicesModule({ featureProfile: 'INTERMEDIATE' });
    const order = await mod.createServiceOrder({
      id: 'srv-facade-1',
      type: 'REPAIR',
      customerId: 'cust-1',
      asset: { description: 'Rotomartillo Bosch' },
      reportedIssue: 'No enciende',
    });

    const quoted = await mod.recordDiagnosisAndQuote({
      serviceOrderId: order.id,
      diagnosisNotes: 'Cable dañado',
      estimatedTotalCents: 50000,
    });
    expect(quoted.status).toBe('QUOTED');
  });
});
