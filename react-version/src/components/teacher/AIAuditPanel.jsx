import React, { useState } from 'react';
import { Card, Title, Text, Badge, Button, Flex, ProgressCircle, Divider } from '@tremor/react';
import { Check, X, Edit2, AlertCircle } from 'lucide-react';

const MOCK_HYPOTHESES = [
  {
    id: 'h1',
    skill: 'פריטת עשרות',
    confidence: 85,
    description: 'זוהה קושי בפריטת עשרות. התלמיד ביצע 4 ביטולים רצופים (Undo) בעת ניסיון גרירת עשרת ליחידות.',
    status: 'pending'
  },
  {
    id: 'h2',
    skill: 'שימוש באפס כשומר מקום',
    confidence: 92,
    description: 'שליטה מלאה. התלמיד בנה נכון את המספר 104 ללא היסוס.',
    status: 'pending'
  }
];

export default function AIAuditPanel() {
  const [hypotheses, setHypotheses] = useState(MOCK_HYPOTHESES);

  const handleAction = (id, action) => {
    setHypotheses(prev => prev.map(h => 
      h.id === id ? { ...h, status: action } : h
    ));
  };

  return (
    <Card className="h-full bg-slate-900/50 backdrop-blur-xl border border-slate-700/50">
      <Flex className="mb-4">
        <Title className="text-slate-100 flex items-center gap-2">
          <AlertCircle size={20} className="text-indigo-400" />
          השערות AI לאימות
        </Title>
        <Badge color="indigo" size="sm">{hypotheses.filter(h => h.status === 'pending').length} בהמתנה</Badge>
      </Flex>
      <Text className="text-slate-400 mb-6">מערכת ה-AI זיהתה את התבניות הבאות. אנא אשר או דחה את הוספתן לפרופיל ה-Q-Matrix של התלמיד.</Text>

      <div className="space-y-4">
        {hypotheses.map(h => (
          <div key={h.id} className={`p-4 rounded-xl border transition-all ${
            h.status === 'accepted' ? 'bg-emerald-900/20 border-emerald-500/30' : 
            h.status === 'rejected' ? 'bg-rose-900/20 border-rose-500/30' : 
            'bg-slate-800/60 border-slate-700 hover:bg-slate-800/80'
          }`}>
            <Flex alignItems="start" className="mb-3">
              <div>
                <Text className="font-semibold text-slate-200">{h.skill}</Text>
                <Text className="text-sm text-slate-400 mt-1">{h.description}</Text>
              </div>
              <ProgressCircle value={h.confidence} size="md" color={h.confidence > 80 ? "emerald" : "amber"}>
                <span className="text-xs text-slate-300 font-medium">{h.confidence}%</span>
              </ProgressCircle>
            </Flex>
            
            {h.status === 'pending' ? (
              <Flex className="mt-4 gap-2 border-t border-slate-700 pt-3">
                <Button size="xs" color="emerald" icon={Check} onClick={() => handleAction(h.id, 'accepted')} className="flex-1">אשר</Button>
                <Button size="xs" color="rose" variant="secondary" icon={X} onClick={() => handleAction(h.id, 'rejected')} className="flex-1">דחה</Button>
                <Button size="xs" color="slate" variant="light" icon={Edit2} onClick={() => handleAction(h.id, 'modified')}>ערוך</Button>
              </Flex>
            ) : (
              <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-2">
                {h.status === 'accepted' && <Badge color="emerald" icon={Check}>אושר ונשמר</Badge>}
                {h.status === 'rejected' && <Badge color="rose" icon={X}>נדחה ונמחק</Badge>}
                <Button size="xs" variant="light" onClick={() => handleAction(h.id, 'pending')} className="mr-auto text-slate-400">בטל</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
