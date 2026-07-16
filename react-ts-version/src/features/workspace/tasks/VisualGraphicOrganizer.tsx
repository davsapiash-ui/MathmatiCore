import { motion } from 'framer-motion';

export function VisualGraphicOrganizer({ isSubtraction }: { isSubtraction?: boolean }) {
  const steps = [
    { id: 1, text: 'שמים מספר ראשון', icon: '1️⃣' },
    { id: 2, text: isSubtraction ? 'מחסרים מספר שני' : 'מוסיפים מספר שני', icon: '2️⃣' },
    { id: 3, text: 'מחשבים תוצאה', icon: '3️⃣' },
  ];

  return (
    <div className="flex w-full justify-between items-start bg-white/60 p-4 rounded-2xl border-2 border-ws-blue/20 shadow-sm relative overflow-hidden">
      <div className="absolute top-[2.25rem] left-8 right-8 h-1 bg-ws-blue/20 -translate-y-1/2 rounded-full pointer-events-none" />
      {steps.map((step, idx) => (
        <motion.div 
          key={step.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.15 }}
          className="relative z-10 flex flex-col items-center gap-2 bg-white px-2 py-2 rounded-xl shadow-sm border border-ws-surface2 w-[30%]"
        >
          <span className="text-3xl leading-none" aria-hidden="true">{step.icon}</span>
          <span className="font-bold text-xs text-ws-ink text-center leading-tight">{step.text}</span>
        </motion.div>
      ))}
    </div>
  );
}
