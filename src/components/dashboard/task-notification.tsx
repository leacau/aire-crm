
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskNotificationProps {
  overdueCount: number;
  dueTodayCount: number;
  onShowTasks: () => void;
}

export function TaskNotification({ overdueCount, dueTodayCount, onShowTasks }: TaskNotificationProps) {
  const totalTasks = overdueCount + dueTodayCount;
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
    // Center initially on the right side
    const initialX = window.innerWidth - 100;
    const initialY = window.innerHeight / 2;
    setPosition({ x: initialX, y: initialY });
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (notificationRef.current) {
      setIsDragging(true);
      const rect = notificationRef.current.getBoundingClientRect();
      offsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      // Prevent text selection while dragging
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && notificationRef.current) {
      const newX = e.clientX - offsetRef.current.x;
      const newY = e.clientY - offsetRef.current.y;
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);


  if (totalTasks === 0) return null;

  return (
    <div
      ref={notificationRef}
      className={cn(
        "fixed z-50 flex items-center justify-center w-14 h-14 bg-primary rounded-full shadow-lg cursor-grab transition-all duration-150",
        isDragging && "cursor-grabbing scale-110 shadow-xl"
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: 'none', // Prevent scrolling on touch devices while dragging
      }}
      onMouseDown={handleMouseDown}
      onClick={() => !isDragging && onShowTasks()} // Only trigger click if not dragging
    >
      <Bell className="h-7 w-7 text-primary-foreground" />
      {totalTasks > 0 && (
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
          {totalTasks}
        </span>
      )}
    </div>
  );
}
