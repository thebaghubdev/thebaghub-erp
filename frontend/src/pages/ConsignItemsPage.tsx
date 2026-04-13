import { useState } from 'react'

type ConsignmentsTab = 'mine' | 'consign'

const tabBtn =
  'rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 sm:px-4'

export function ConsignItemsPage() {
  const [tab, setTab] = useState<ConsignmentsTab>('mine')

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-4 flex gap-1 border-b border-slate-200 sm:gap-2"
        role="tablist"
        aria-label="Consignments sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mine'}
          id="tab-consignments-mine"
          aria-controls="panel-consignments-mine"
          className={`${tabBtn} ${
            tab === 'mine'
              ? 'border-b-2 border-violet-600 text-violet-700'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => setTab('mine')}
        >
          My consignments
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'consign'}
          id="tab-consignments-items"
          aria-controls="panel-consignments-items"
          className={`${tabBtn} ${
            tab === 'consign'
              ? 'border-b-2 border-violet-600 text-violet-700'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => setTab('consign')}
        >
          Consign items
        </button>
      </div>

      {tab === 'mine' && (
        <section
          id="panel-consignments-mine"
          role="tabpanel"
          aria-labelledby="tab-consignments-mine"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm leading-relaxed text-slate-600">
              Your active and past consignments will appear here.
            </p>
          </div>
        </section>
      )}

      {tab === 'consign' && (
        <section
          id="panel-consignments-items"
          role="tabpanel"
          aria-labelledby="tab-consignments-items"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm leading-relaxed text-slate-600">
              Start a new consignment and add items you want to send in.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
