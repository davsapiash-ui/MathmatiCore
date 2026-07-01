import React, { useState } from 'react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor,
  useSensor, useSensors, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

function DraggableNumber({ id, value }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
    data: { value }
  });
  
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-primary text-primary-foreground p-4 rounded-md cursor-grab shadow-md focus:ring-4 focus:ring-ring outline-none"
      aria-label={`גרור את המספר ${value}`}
      role="button"
      tabIndex={0}
    >
      <span className="text-xl font-bold">{value}</span>
    </div>
  );
}

function DroppableEquationZone({ id, children }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`border-2 border-dashed rounded-xl p-6 w-full min-h-[150px] flex items-center justify-center transition-colors ${
        isOver ? 'bg-primary/10 border-primary' : 'bg-slate-50 border-slate-300 dark:bg-slate-800 dark:border-slate-600'
      }`}
      aria-label="אזור גרירה למשוואה"
    >
      {children}
    </div>
  );
}

export default function UdlMathModule({ onInteract, onUndo }) {
  const [equation, setEquation] = useState('100 + 40');
  const [chartData, setChartData] = useState([
    { name: 'מאות', value: 100 },
    { name: 'עשרות', value: 40 },
    { name: 'יחידות', value: 0 }
  ]);
  const [mathquillInput, setMathquillInput] = useState('140');

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    if (onInteract) onInteract();
    
    const { active, over } = event;
    if (over && over.id === 'equation-dropzone') {
      const draggedValue = active.data.current.value;
      setEquation(`100 + 40 + ${draggedValue}`);
      setChartData(prev => [
        prev[0], prev[1], { name: 'יחידות', value: draggedValue }
      ]);
    }
  };

  const handleMathquillChange = (mathField) => {
    if (onInteract) onInteract();
    setMathquillInput(mathField.latex());
  };

  const handleUndo = () => {
    if (onUndo) onUndo();
    // Revert to initial mock state for now
    setEquation('100 + 40');
    setChartData([
      { name: 'מאות', value: 100 },
      { name: 'עשרות', value: 40 },
      { name: 'יחידות', value: 0 }
    ]);
  };

  return (
    <div className="flex flex-col gap-8 w-full p-6" dir="rtl">
      <div className="text-center flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold mb-2 text-foreground">מודול הדגמה מתמטי (UDL Boilerplate)</h2>
          <p className="text-muted-foreground">ייצוג כפול, נגישות מקלדת, מנגנוני בחירה, והמחשה גרפית במקביל לנוסחאות.</p>
        </div>
        <button 
          onClick={handleUndo} 
          className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 transition-colors"
          aria-label="בטל פעולה אחרונה"
        >
          בטל פעולה ↩
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left Side */}
        <div className="flex-1 flex flex-col gap-6 bg-card text-card-foreground p-6 rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold">1. ביטוי וייצוג מתמטי (KaTeX & MathQuill)</h3>
          
          <div className="w-full p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">ייצוג ויזואלי של משוואה (KaTeX):</p>
            <BlockMath math={`${equation} = ${mathquillInput || '?'}`} />
          </div>

          <div className="w-full">
            <p className="text-sm text-muted-foreground mb-2">הקלדה מתמטית חופשית (MathQuill):</p>
            <div dir="ltr" className="border border-border rounded-md p-2 bg-background focus-within:ring-2 ring-ring">
              <input
                type="text"
                value={mathquillInput}
                onChange={(e) => handleMathquillChange(e.target.value)}
                className="w-full bg-transparent outline-none p-1"
                placeholder="הקלד כאן..."
              />
            </div>
          </div>

          <div className="w-full mt-4">
            <h4 className="text-md font-semibold mb-4">2. אינטראקציה פיזית ונגישות (Dnd-Kit)</h4>
            <p className="text-sm text-muted-foreground mb-4">השתמש בעכבר או ב-Tab+Space במקלדת כדי לגרור ערכים למשוואה:</p>
            
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 mb-6 justify-center">
                <DraggableNumber id="drag-1" value={5} />
                <DraggableNumber id="drag-2" value={10} />
                <DraggableNumber id="drag-3" value={100} />
              </div>

              <DroppableEquationZone id="equation-dropzone">
                <span className="text-muted-foreground font-bold">גרור פריטים לכאן כדי לחבר אותם</span>
              </DroppableEquationZone>
            </DndContext>
          </div>
        </div>

        {/* Right Side */}
        <div className="flex-1 flex flex-col gap-6 bg-card text-card-foreground p-6 rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold">3. קידוד כפול (Dual Coding via Recharts)</h3>
          <p className="text-sm text-muted-foreground">הגרף מתעדכן בזמן אמת בתגובה לשינויים במשוואה המופשטת.</p>
          
          <div className="w-full h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis dataKey="name" stroke="currentColor" />
                <YAxis stroke="currentColor" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)',
                    color: 'var(--card-foreground)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }} 
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
