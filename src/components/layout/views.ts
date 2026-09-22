export type ConsoleView =
  | 'traffic'
  | 'engine'
  | 'decisions'
  | 'experiments'
  | 'trust'
  | 'signals'

export const CONSOLE_VIEWS: {
  id: ConsoleView
  label: string
  description: string
}[] = [
  {
    id: 'traffic',
    label: 'Traffic',
    description: 'Configure company, risk profile, and submit test payments',
  },
  {
    id: 'engine',
    label: 'Engine',
    description: 'Live authorization status and next-payment preview',
  },
  {
    id: 'decisions',
    label: 'Decisions',
    description: 'Decision history and evidence for one payment',
  },
  {
    id: 'experiments',
    label: 'Experiments',
    description: 'Approve/decline scores by experiment group',
  },
  {
    id: 'trust',
    label: 'Trust',
    description: 'Company isolation and ledger integrity',
  },
  {
    id: 'signals',
    label: 'Signals',
    description: 'Ops alerts for stop and cost events',
  },
]
