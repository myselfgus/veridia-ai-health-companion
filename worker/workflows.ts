import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { Env } from './core-utils';
import { processDocumentJob, writeAuditEvent } from './cell-store';
import type { DocumentJobMessage } from './types';

export class DocumentProcessingWorkflow extends WorkflowEntrypoint<Env, DocumentJobMessage> {
  async run(event: Readonly<WorkflowEvent<DocumentJobMessage>>, step: WorkflowStep) {
    const payload = event.payload;

    await step.do(
      'process document intelligence',
      {
        retries: {
          limit: 3,
          delay: '10 seconds',
          backoff: 'exponential',
        },
        timeout: '5 minutes',
      },
      async () => {
        await processDocumentJob(this.env, payload);
        return {
          patientId: payload.patientId,
          documentId: payload.documentId,
          jobId: payload.jobId,
          status: 'processed',
        };
      },
    );

    await step.do('write workflow audit', async () => {
      await writeAuditEvent(this.env, payload.patientId, 'document.workflow', 'DOCUMENT_WORKFLOW', 'ok', {
        documentId: payload.documentId,
        jobId: payload.jobId,
      });
      return { audited: true };
    });

    return {
      jobId: payload.jobId,
      documentId: payload.documentId,
      status: 'complete',
    };
  }
}
