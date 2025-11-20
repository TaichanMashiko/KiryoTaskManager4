import React from 'react';
import { Priority, Status } from '../types';

interface BadgeProps {
  type: 'priority' | 'status';
  value: string;
}

export const Badge: React.FC<BadgeProps> = ({ type, value }) => {
  let classes = "px-2 py-1 rounded-full text-xs font-medium border ";

  if (type === 'priority') {
    switch (value) {
      case Priority.HIGH:
        classes += "bg-red-100 text-red-700 border-red-200";
        break;
      case Priority.MEDIUM:
        classes += "bg-yellow-100 text-yellow-700 border-yellow-200";
        break;
      case Priority.LOW:
        classes += "bg-blue-100 text-blue-700 border-blue-200";
        break;
      default:
        classes += "bg-gray-100 text-gray-700 border-gray-200";
    }
  } else {
    switch (value) {
      case Status.COMPLETED:
        classes += "bg-green-100 text-green-700 border-green-200";
        break;
      case Status.IN_PROGRESS:
        classes += "bg-indigo-100 text-indigo-700 border-indigo-200";
        break;
      case Status.NOT_STARTED:
        classes += "bg-gray-100 text-gray-600 border-gray-200";
        break;
      default:
        classes += "bg-gray-100 text-gray-700";
    }
  }

  return <span className={classes}>{value}</span>;
};