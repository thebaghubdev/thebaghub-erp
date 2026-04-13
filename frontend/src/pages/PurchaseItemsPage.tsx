import { useState } from 'react'

type PurchasesTab = 'mine' | 'purchase'

const tabBtn =
  'rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500 sm:px-4'

export function PurchaseItemsPage() {
  const [tab, setTab] = useState<PurchasesTab>('mine')

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-4 flex gap-1 border-b border-slate-200 sm:gap-2"
        role="tablist"
        aria-label="Purchases sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mine'}
          id="tab-purchases-mine"
          aria-controls="panel-purchases-mine"
          className={`${tabBtn} ${
            tab === 'mine'
              ? 'border-b-2 border-violet-600 text-violet-700'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => setTab('mine')}
        >
          My purchases
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'purchase'}
          id="tab-purchases-items"
          aria-controls="panel-purchases-items"
          className={`${tabBtn} ${
            tab === 'purchase'
              ? 'border-b-2 border-violet-600 text-violet-700'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => setTab('purchase')}
        >
          Purchase items
        </button>
      </div>

      {tab === 'mine' && (
        <section
          id="panel-purchases-mine"
          role="tabpanel"
          aria-labelledby="tab-purchases-mine"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm leading-relaxed text-slate-600">
              Your orders and purchase history will appear here.
            </p>
          </div>
        </section>
      )}

      {tab === 'purchase' && (
        <section
          id="panel-purchases-items"
          role="tabpanel"
          aria-labelledby="tab-purchases-items"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm leading-relaxed text-slate-600">
              Browse available inventory and buy items.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
