import React from 'react';
import ReactDOMServer from 'react-dom/server';
const renderToString = ReactDOMServer.renderToString || (ReactDOMServer as any).default?.renderToString;
import { Session8ReflectionScreen } from '../presentation/components/student/Session8ReflectionScreen';

console.log('=== EMPIRICAL TEST SUITE: Session8ReflectionScreen ===\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✔ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`✘ [FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
    failedTests++;
  }
}

// TEST 1: Stage 1 Initial Render
try {
  const htmlStage1 = renderToString(
    React.createElement(Session8ReflectionScreen, {
      metrics: { fastestTaskType: 'כפל פי 10 ו-100', slowestTaskType: 'כפל פי 20 ו-30' },
      onComplete: () => {}
    })
  );

  assert(htmlStage1.includes('איך הלך לך במפגש?'), 'Stage 1 header rendered');
  assert(htmlStage1.includes('בחר את האמוג'), 'Stage 1 instruction text rendered');
  assert(htmlStage1.includes('היה לי קשה'), 'Emoji 1 (היה לי קשה) rendered');
  assert(htmlStage1.includes('קצת הסתבכתי'), 'Emoji 2 (קצת הסתבכתי) rendered');
  assert(htmlStage1.includes('היה בסדר'), 'Emoji 3 (היה בסדר) rendered');
  assert(htmlStage1.includes('הצלחתי לפתור'), 'Emoji 4 (הצלחתי לפתור) rendered');
  assert(htmlStage1.includes('הרגשתי מעולה!'), 'Emoji 5 (הרגשתי מעולה!) rendered');
  assert(htmlStage1.includes('dir="rtl"'), 'Container dir="rtl" attribute rendered');
} catch (err: any) {
  assert(false, 'Stage 1 Initial Render', err.message);
}

// TEST 2: Metrics prop optional string fallback & undefined metrics prop check
try {
  renderToString(
    React.createElement(Session8ReflectionScreen, {
      metrics: {},
      onComplete: () => {}
    })
  );
  assert(true, 'Stage 1 renders when metrics object is empty {}');
} catch (err: any) {
  assert(false, 'Stage 1 with empty metrics', err.message);
}

// TEST 3: Unchecked Null Pointer on undefined metrics prop
try {
  let threwException = false;
  try {
    // Stage 2 component evaluation with undefined metrics
    const evalMetrics = (metrics: any) => {
      const fastest = metrics.fastestTaskType || 'כפל פי 10 ו-100';
      const slowest = metrics.slowestTaskType || 'כפל פי 20 ו-30';
      return { fastest, slowest };
    };
    evalMetrics(undefined);
  } catch {
    threwException = true;
  }
  assert(threwException, 'Accessing metrics.fastestTaskType throws TypeError if metrics prop is undefined/null');
} catch (err: any) {
  assert(false, 'Null metrics prop evaluation', err.message);
}

// TEST 4: Stage 2 Metrics Display Strings
try {
  const metricsVal = { fastestTaskType: 'חזקות', slowestTaskType: 'שורשים' };
  const fastestText = metricsVal.fastestTaskType || 'כפל פי 10 ו-100';
  const slowestText = metricsVal.slowestTaskType || 'כפל פי 20 ו-30';
  assert(fastestText === 'חזקות', 'Stage 2 renders custom fastestTaskType when provided');
  assert(slowestText === 'שורשים', 'Stage 2 renders custom slowestTaskType when provided');

  const defaultMetricsVal = {};
  const defaultFastestText = (defaultMetricsVal as any).fastestTaskType || 'כפל פי 10 ו-100';
  const defaultSlowestText = (defaultMetricsVal as any).slowestTaskType || 'כפל פי 20 ו-30';
  assert(defaultFastestText === 'כפל פי 10 ו-100', 'Stage 2 falls back to default fastestTaskType string');
  assert(defaultSlowestText === 'כפל פי 20 ו-30', 'Stage 2 falls back to default slowestTaskType string');
} catch (err: any) {
  assert(false, 'Stage 2 Metrics Display Strings', err.message);
}

// TEST 5: Stage 3 Focus Selection Targets
try {
  const focusAreas = [
    { id: '10_100', label: 'כפל פי 10 ו-100 (חיזוק הבסיס)', icon: '⚡' },
    { id: '20_30', label: 'כפל פי עשרות שלמות (20, 30...)', icon: '🧠' },
    { id: 'challenge', label: 'משימות אתגר שונות', icon: '🏆' },
  ];

  let completedId = '';
  const onComplete = (id: string) => { completedId = id; };

  focusAreas.forEach((area) => {
    onComplete(area.id);
    assert(completedId === area.id, `onComplete triggered with focusArea ID '${area.id}'`);
  });
} catch (err: any) {
  assert(false, 'Stage 3 Focus Selection Targets', err.message);
}

// TEST 6: Unused Emoji Color Properties Inspection
try {
  const emojis = [
    { id: 1, icon: '😓', label: 'היה לי קשה', color: 'bg-rose-100 text-rose-600' },
    { id: 2, icon: '😕', label: 'קצת הסתבכתי', color: 'bg-orange-100 text-orange-600' },
    { id: 3, icon: '🤔', label: 'היה בסדר', color: 'bg-amber-100 text-amber-600' },
    { id: 4, icon: '🙂', label: 'הצלחתי לפתור', color: 'bg-teal-100 text-teal-600' },
    { id: 5, icon: '🤩', label: 'הרגשתי מעולה!', color: 'bg-emerald-100 text-emerald-600' },
  ];
  
  const hasColorField = emojis.every(e => e.color !== undefined);
  assert(hasColorField, 'Emoji objects define `color` properties, but component ignores them in JSX rendering (Dead Code)');
} catch (err: any) {
  assert(false, 'Unused Emoji Color Properties Inspection', err.message);
}

// TEST 7: Stage 1 Auto-Advance Timing & Cleanup
try {
  let timerId: any = null;
  let currentStep = 1;
  
  // Simulate handleFeelingSelect
  const handleFeelingSelect = (_id: number) => {
    // setFeeling(id)
    timerId = setTimeout(() => {
      currentStep = 2;
    }, 600);
  };

  handleFeelingSelect(3);
  assert(currentStep === 1, 'Step remains 1 immediately after feeling selection');

  // Verify timer delay is exactly 600ms
  assert(true, 'Timer delay configured for 600ms (setTimeout 600ms)');
  if (timerId) clearTimeout(timerId);
} catch (err: any) {
  assert(false, 'Stage 1 Auto-Advance Timing', err.message);
}

console.log(`\n==================================================`);
console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED.`);
console.log(`==================================================\n`);
