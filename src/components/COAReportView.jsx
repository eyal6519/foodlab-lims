import React from 'react'
import { calculateTest, getTestDefinition, avg, num, fmt } from '../utils/calculations'

// Shared Certificate of Analysis report rendered inside #coa-report-view.
// `batch` must carry its shipment (batch.shipment) so the metadata grid and
// results table resolve product/template/supplier without extra lookups.
export default function COAReportView({ batch, template, results, t }) {
  const releaseDate = batch?.approved_at ? new Date(batch.approved_at) : new Date(null)
  return (
    <div className="w-full overflow-x-auto scrollbar-none pb-6 no-print">
      <div id="coa-report-view" className="p-8 bg-white text-slate-900 border border-slate-300 rounded-3xl w-[700px] sm:w-auto max-w-3xl mx-auto shadow-xl flex flex-col justify-between min-h-[9.2in] shrink-0">
        {/* COA Top Header */}
        <div>
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
            <div>
              <h1 className="text-2xl font-black uppercase text-slate-950">{t('coa.title')}</h1>
              <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-0.5">
                {t('coa.lab_name')}
              </p>
            </div>
            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-slate-900 text-white text-[10px] font-bold uppercase rounded">
                {t('coa.approved_badge')}
              </div>
              <p className="text-[10px] text-slate-500 mt-2 font-medium">
                {t('coa.release_date').replace('{d}', releaseDate.toLocaleDateString())}
              </p>
            </div>
          </div>

          {/* Metadata Table */}
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-xs mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <span className="text-[9px] font-bold text-slate-450 uppercase block">{t('coa.field.product')}</span>
              <span className="font-extrabold text-slate-900">{template?.name}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-450 uppercase block">{t('coa.field.batch')}</span>
              <span className="font-extrabold text-slate-900">{batch?.number || t('coa.unnamed_batch')}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-450 uppercase block">{t('coa.field.supplier')}</span>
              <span className="font-medium text-slate-900">{batch?.shipment?.supplier}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-450 uppercase block">{t('coa.field.prod_date')}</span>
              <span className="font-medium text-slate-900">{batch?.production_date || '-'}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-450 uppercase block">{t('coa.field.exp_date')}</span>
              <span className="font-medium text-slate-900">{batch?.expiration_date || '-'}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-450 uppercase block">{t('coa.field.intake_date')}</span>
              <span className="font-medium text-slate-900">{batch?.shipment?.intake_date}</span>
            </div>
          </div>

          {/* Results Table */}
          <table className="w-full text-left border-collapse text-xs border border-slate-200">
            <thead>
              <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3 w-2/5 text-white">{t('coa.table.parameter')}</th>
                <th className="p-3 w-2/5 text-center text-white">{t('coa.table.replicates')}</th>
                <th className="p-3 w-1/5 text-right text-white">{t('coa.table.result')}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                if (!batch || !template?.tests) return null
                const batchResults = {}
                template.tests.forEach(tid => {
                  batchResults[tid] = results[`${batch.id}:${tid}`] || []
                })

                return template.tests.map(tid => {
                  const test = getTestDefinition(tid, template)
                  if (!test) return null
                  const repData = results[`${batch.id}:${tid}`] || []
                  const calc = calculateTest(tid, repData, batchResults, test)

                  if (tid === 'weight') {
                    const avgGross = avg(repData.map(r => num(r.gross)))
                    const avgNet = avg(repData.map(r => num(r.net)))
                    const firstTare = repData.find(r => r.tare !== undefined && r.tare !== null && r.tare !== '')?.tare
                    const tareVal = firstTare !== undefined ? num(firstTare) : NaN

                    const grossLabel = Number.isFinite(avgGross) ? `${fmt(avgGross)} g` : '-'
                    const tareLabel = Number.isFinite(tareVal) ? `${fmt(tareVal)} g` : '-'
                    const netLabel = Number.isFinite(avgNet) ? `${fmt(avgNet)} g` : '-'

                    const grossVals = repData.map(r => num(r.gross)).filter(Number.isFinite)
                    const netVals = repData.map(r => num(r.net)).filter(Number.isFinite)

                    return (
                      <React.Fragment key={tid}>
                        <tr className="border-b border-slate-150">
                          <td className="p-3 font-semibold text-slate-800">{t('coa.weight.avg_gross')}</td>
                          <td className="p-3 text-center text-slate-800 font-semibold">
                            {grossVals.length > 0 ? grossVals.map(v => fmt(v)).join(', ') : '-'}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-950">{grossLabel}</td>
                        </tr>
                        <tr className="border-b border-slate-150">
                          <td className="p-3 font-semibold text-slate-800">{t('coa.weight.tare')}</td>
                          <td className="p-3 text-center text-slate-800 font-semibold">-</td>
                          <td className="p-3 text-right font-bold text-slate-950">{tareLabel}</td>
                        </tr>
                        <tr className="border-b border-slate-150 last:border-0">
                          <td className="p-3 font-semibold text-slate-800">{t('coa.weight.avg_net')}</td>
                          <td className="p-3 text-center text-slate-800 font-semibold">
                            {netVals.length > 0 ? netVals.map(v => fmt(v)).join(', ') : '-'}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-950">{netLabel}</td>
                        </tr>
                      </React.Fragment>
                    )
                  }

                  const values = calc.values || []
                  const hasReplicates = values.length > 0 && test.kind !== 'qualitative' && !test.isCalculated

                  return (
                    <tr key={tid} className="border-b border-slate-150 last:border-0">
                      <td className="p-3 font-semibold text-slate-800">{test.name}</td>
                      <td className="p-3 text-center text-slate-800 font-semibold">
                        {hasReplicates ? values.map(v => fmt(v)).join(', ') : '-'}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-950">{calc.label}</td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>

        {/* COA Bottom Signoff Footer */}
        <div className="border-t border-slate-200 pt-6 mt-auto">
          <div className="flex justify-between items-end">
            <div className="text-[10px] text-slate-500 font-medium max-w-sm">
              {t('coa.disclaimer')}
            </div>
            <div className="text-right">
              <div className="w-36 border-b border-slate-400 mb-2 h-8" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                {t('coa.signature')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}