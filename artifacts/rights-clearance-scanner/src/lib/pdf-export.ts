import type { Report } from '@workspace/api-client-react';

export function exportReportToPDF(report: Report & { name?: string }, projectTitle: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    alert('Please allow popups to export the PDF report.');
    return;
  }

  const generatedDate = new Date(report.generatedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const highCount = report.counts.high ?? 0;
  const medCount = report.counts.medium ?? 0;
  const lowCount = report.counts.low ?? 0;
  const totalFindings = report.detections.length;

  const statusLabel =
    highCount > 0
      ? 'HIGH RISK — LEGAL CLEARANCE REQUIRED'
      : medCount > 0
      ? 'MODERATE RISK — LICENSING REVIEW ADVISED'
      : 'LOW RISK — PROCEED TO EDIT LOCK';

  const statusColor =
    highCount > 0 ? '#b91c1c' : medCount > 0 ? '#b45309' : '#047857';

  const detectionsHtml = report.detections
    .map(
      (d, i) => `
      <div style="border-bottom: 1px solid #e5e7eb; padding: 14px 0; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <div>
            <span style="font-size: 11px; color: #6b7280; margin-right: 8px; font-weight: bold;">#${String(
              i + 1
            ).padStart(2, '0')}</span>
            <strong style="font-size: 15px; color: #111827;">${d.name}</strong>
            <span style="display: inline-block; background: #f3f4f6; color: #4b5563; font-size: 10px; font-weight: bold; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">
              ${d.category.replace('_', ' ')}
            </span>
          </div>
          <span style="font-weight: bold; font-size: 11px; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; background: ${
            d.riskLevel === 'high'
              ? '#fee2e2; color: #991b1b;'
              : d.riskLevel === 'medium'
              ? '#fef3c7; color: #92400e;'
              : '#d1fae5; color: #065f46;'
          }">
            ${d.riskLevel} RISK
          </span>
        </div>
        <div style="margin-top: 6px; font-size: 12px; color: #4b5563;">
          <strong>Source Reference:</strong> ${d.sourceRef} · <strong>Confidence:</strong> ${Math.round(
        d.confidence * 100
      )}%
        </div>
        <div style="margin-top: 6px; background: #f9fafb; padding: 8px 10px; border-left: 3px solid #d1d5db; font-size: 12px; font-style: italic; color: #374151;">
          "${d.contextSnippet}"
        </div>
        <div style="margin-top: 6px; font-size: 12px; color: #1f2937;">
          <strong>Legal Rationale:</strong> ${d.rationale}
        </div>
        ${
          d.visualEvidence
            ? `<div style="margin-top: 4px; font-size: 11px; color: #6b7280;"><strong>Visual Evidence:</strong> ${d.visualEvidence}</div>`
            : ''
        }
      </div>
    `
    )
    .join('');

  const toolCallsHtml =
    (report as any).toolCalls && (report as any).toolCalls.length > 0
      ? `
      <div style="margin-top: 30px; page-break-inside: avoid;">
        <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #111827; padding-bottom: 4px; margin-bottom: 12px;">
          Agentic Autonomous Decision Trail (${(report as any).toolCalls.length} Tool Executions)
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #f3f4f6; text-align: left;">
              <th style="padding: 6px 8px; border: 1px solid #e5e7eb;">Step</th>
              <th style="padding: 6px 8px; border: 1px solid #e5e7eb;">Tool Invoked</th>
              <th style="padding: 6px 8px; border: 1px solid #e5e7eb;">Finding Summary</th>
            </tr>
          </thead>
          <tbody>
            ${(report as any).toolCalls
              .map(
                (tc: any, idx: number) => `
                <tr>
                  <td style="padding: 5px 8px; border: 1px solid #e5e7eb;">${String(
                    idx + 1
                  ).padStart(2, '0')}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e5e7eb; font-weight: bold; color: #1d4ed8;">${
                    tc.tool
                  }</td>
                  <td style="padding: 5px 8px; border: 1px solid #e5e7eb; color: #4b5563;">${
                    tc.result_summary
                  }</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
      : '';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>RightScan Legal Clearance Report — ${projectTitle}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 18mm 16mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #111827;
            background: #ffffff;
            margin: 0;
            padding: 20px;
            line-height: 1.45;
          }
          .slate-header {
            border: 3px solid #111827;
            padding: 16px 20px;
            margin-bottom: 24px;
            background: #fbfbfb;
          }
          .stat-box {
            display: inline-block;
            width: 22%;
            text-align: center;
            background: #f3f4f6;
            padding: 10px 4px;
            border-radius: 4px;
            margin-right: 2%;
          }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; padding: 12px; background: #e0e7ff; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #3730a3; font-weight: bold;">
            Previewing RightScan Clearance Audit Document
          </span>
          <button onclick="window.print()" style="background: #4338ca; color: #ffffff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer;">
            Print / Save to PDF
          </button>
        </div>

        <div class="slate-header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 12px;">
            <div>
              <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase;">
                🎬 RIGHTSCANNER
              </div>
              <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; margin-top: 2px;">
                Film, Script & Media Rights Clearance Intelligence
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; font-weight: bold; color: #374151;">
                REPORT ID: ${report.name || (report as any).id?.slice(0, 12) || 'RPT-CLEARANCE'}
              </div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">
                Audit Timestamp: ${generatedDate}
              </div>
            </div>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">PRODUCTION TITLE</div>
              <div style="font-size: 18px; font-weight: bold; color: #111827;">${projectTitle}</div>
            </div>
            <div style="border: 2px solid ${statusColor}; background: #ffffff; padding: 6px 14px; border-radius: 4px; text-align: center;">
              <div style="font-size: 9px; font-weight: bold; text-transform: uppercase; color: #6b7280;">VERDICT</div>
              <div style="font-size: 12px; font-weight: 900; color: ${statusColor};">${statusLabel}</div>
            </div>
          </div>
        </div>

        <!-- Executive Metrics -->
        <div style="margin-bottom: 24px;">
          <div class="stat-box">
            <div style="font-size: 9px; text-transform: uppercase; color: #6b7280; font-weight: bold;">TOTAL FINDINGS</div>
            <div style="font-size: 22px; font-weight: 900; color: #111827;">${totalFindings}</div>
          </div>
          <div class="stat-box" style="background: #fee2e2;">
            <div style="font-size: 9px; text-transform: uppercase; color: #991b1b; font-weight: bold;">HIGH RISK</div>
            <div style="font-size: 22px; font-weight: 900; color: #991b1b;">${highCount}</div>
          </div>
          <div class="stat-box" style="background: #fef3c7;">
            <div style="font-size: 9px; text-transform: uppercase; color: #92400e; font-weight: bold;">MEDIUM RISK</div>
            <div style="font-size: 22px; font-weight: 900; color: #92400e;">${medCount}</div>
          </div>
          <div class="stat-box" style="background: #d1fae5; margin-right: 0;">
            <div style="font-size: 9px; text-transform: uppercase; color: #065f46; font-weight: bold;">LOW RISK</div>
            <div style="font-size: 22px; font-weight: 900; color: #065f46;">${lowCount}</div>
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; margin-bottom: 6px;">Executive Clearance Summary</h3>
          <p style="font-size: 13px; line-height: 1.5; color: #4b5563; background: #f9fafb; padding: 12px 14px; border-radius: 4px; border: 1px solid #e5e7eb; margin: 0;">
            ${report.summary}
          </p>
        </div>

        <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #111827; padding-bottom: 4px; margin-top: 24px; margin-bottom: 10px;">
          Detailed Intellectual Property & Trademark Findings
        </h3>

        ${
          report.detections.length === 0
            ? '<p style="font-size: 13px; color: #6b7280; font-style: italic;">No third-party intellectual property or rights references detected in this review set.</p>'
            : detectionsHtml
        }

        ${toolCallsHtml}

        <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 11px; color: #6b7280; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between;">
            <div>
              <strong>RightScan Automated Intelligence Engine</strong><br />
              Powered by Google Gemini ADK & ClickHouse Chain-of-Title Database<br />
              Audit records immutably preserved in ClickHouse Cloud.
            </div>
            <div style="text-align: right;">
              _______________________________________<br />
              <strong>Production Legal Counsel Signature</strong>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
