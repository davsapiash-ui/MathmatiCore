import { useState, useCallback } from 'react';

const PLACE_ORDER = ['units', 'tens', 'hundreds', 'thousands'];
const PLACE_VALUES = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
const PLACE_NAMES_HE = { units: 'יחידות', tens: 'עשרות', hundreds: 'מאות', thousands: 'אלפים' };

export default function usePlaceValueModel(initialCounts = { units: 0, tens: 0, hundreds: 0, thousands: 0 }) {
  const [counts, setCounts] = useState(initialCounts);

  const getValue = useCallback(() => {
    return counts.units * 1 + counts.tens * 10 + counts.hundreds * 100 + counts.thousands * 1000;
  }, [counts]);

  const reset = useCallback(() => {
    setCounts({ units: 0, tens: 0, hundreds: 0, thousands: 0 });
  }, []);

  const setValues = useCallback((values) => {
    setCounts({
      units: values.units ?? 0,
      tens: values.tens ?? 0,
      hundreds: values.hundreds ?? 0,
      thousands: values.thousands ?? 0
    });
  }, []);

  const checkAndGroup = useCallback((currentCounts) => {
    let newCounts = { ...currentCounts };
    const events = [];
    for (let i = 0; i < PLACE_ORDER.length - 1; i++) {
      const from = PLACE_ORDER[i];
      const to = PLACE_ORDER[i + 1];
      if (newCounts[from] >= 10) {
        const groups = Math.floor(newCounts[from] / 10);
        newCounts[from] -= groups * 10;
        newCounts[to] += groups;
        events.push({ from, to, groups });
      }
    }
    return { newCounts, events };
  }, []);

  const addBlock = useCallback((place, autoGroup = false) => {
    if (!PLACE_ORDER.includes(place)) return null;
    
    setCounts(prev => {
      const next = { ...prev, [place]: prev[place] + 1 };
      if (autoGroup) {
        const result = checkAndGroup(next);
        return result.newCounts;
      }
      return next;
    });
  }, [checkAndGroup]);

  const removeBlock = useCallback((place) => {
    if (!PLACE_ORDER.includes(place)) return false;
    
    let success = false;
    setCounts(prev => {
      if (prev[place] <= 0) return prev;
      success = true;
      return { ...prev, [place]: prev[place] - 1 };
    });
    return success;
  }, []);

  const ungroupBlock = useCallback((fromPlace) => {
    const fromIdx = PLACE_ORDER.indexOf(fromPlace);
    if (fromIdx <= 0) return false;
    
    const toPlace = PLACE_ORDER[fromIdx - 1];
    let success = false;
    
    setCounts(prev => {
      if (prev[fromPlace] <= 0) return prev;
      success = true;
      return {
        ...prev,
        [fromPlace]: prev[fromPlace] - 1,
        [toPlace]: prev[toPlace] + 10
      };
    });
    
    if (success) {
      return { from: fromPlace, to: toPlace };
    }
    return false;
  }, []);

  const addUngroupedFromPalette = useCallback((fromPlace) => {
    const fromIdx = PLACE_ORDER.indexOf(fromPlace);
    if (fromIdx <= 0) return false;
    const toPlace = PLACE_ORDER[fromIdx - 1];
    
    setCounts(prev => ({ ...prev, [toPlace]: prev[toPlace] + 10 }));
    return true;
  }, []);

  return {
    counts,
    PLACE_ORDER,
    PLACE_VALUES,
    PLACE_NAMES_HE,
    getValue,
    reset,
    setValues,
    addBlock,
    removeBlock,
    ungroupBlock,
    addUngroupedFromPalette
  };
}
