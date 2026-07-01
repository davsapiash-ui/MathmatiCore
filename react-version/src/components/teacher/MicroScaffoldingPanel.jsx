import React, { useState } from 'react';
import { Card, Title, Text, Button, Flex, Divider } from '@tremor/react';
import { Focus, Sparkles, Mic, Send, Lightbulb } from 'lucide-react';

export default function MicroScaffoldingPanel() {
  const [isRecording, setIsRecording] = useState(false);

  const handleToggleASD = () => {
    alert('נשלחה פקודה לתלמיד: הפעל סינון הסחות (ASD Mode). המסך שלו יתמקד כעת בטור הפעיל בלבד.');
  };

  const handleSendHint = () => {
    alert('נשלח הבזק ויזואלי לתלמיד המאיר את טור העשרות.');
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (isRecording) {
      alert('הודעה קולית נשלחה לתלמיד (אסינכרונית).');
    }
  };

  return (
    <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 mt-6">
      <Flex className="mb-4">
        <Title className="text-slate-100 flex items-center gap-2">
          <Lightbulb size={20} className="text-amber-400" />
          לולאת משוב וסיוע חכם (Scaffolding)
        </Title>
      </Flex>
      <Text className="text-slate-400 mb-6 text-sm">שלח תמיכה שקטה וממוקדת שלא תייצר עומס קוגניטיבי אצל התלמיד.</Text>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Button 
          variant="secondary" 
          color="indigo" 
          icon={Focus} 
          onClick={handleToggleASD}
          className="bg-indigo-900/30 hover:bg-indigo-800/40 border-indigo-500/30 text-indigo-200"
        >
          כפה סינון הסחות (ASD)
        </Button>
        <Button 
          variant="secondary" 
          color="amber" 
          icon={Sparkles} 
          onClick={handleSendHint}
          className="bg-amber-900/30 hover:bg-amber-800/40 border-amber-500/30 text-amber-200"
        >
          רמז ויזואלי לעשרות
        </Button>
      </div>

      <Divider className="border-slate-700/50" />

      <div>
        <Text className="text-slate-300 font-medium mb-3">הודעה קולית (Voice Note)</Text>
        <Flex gap="2">
          <button 
            className={`flex-1 rounded-lg border p-3 flex items-center justify-center gap-2 transition-all ${
              isRecording 
                ? 'bg-rose-900/40 border-rose-500 text-rose-300 animate-pulse' 
                : 'bg-slate-800/60 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
            onClick={toggleRecording}
          >
            <Mic size={18} />
            {isRecording ? 'מקליט... (לחץ שוב לשליחה)' : 'הקלט הודעת עידוד'}
          </button>
        </Flex>
      </div>
    </Card>
  );
}
