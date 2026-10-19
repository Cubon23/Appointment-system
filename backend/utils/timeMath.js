// Converts "14:30" into 870 (minutes from midnight)
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours * 60) + minutes;
};

// The Interval Overlap Engine
const isOverlapping = (newStartStr, existingEvents, newDuration = 60) => {
  const newStart = timeToMinutes(newStartStr);
  const newEnd = newStart + (Number(newDuration) || 60);

  return existingEvents.some(event => {
    const existingStart = timeToMinutes(event.startTime || event.time);
    const existingEnd = event.endTime ? timeToMinutes(event.endTime) : existingStart + (Number(event.duration) || 60);
    
    // The mathematical absolute for collision detection
    return (newStart < existingEnd) && (existingStart < newEnd);
  });
};

module.exports = { timeToMinutes, isOverlapping };