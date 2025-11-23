
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CostItem } from '../types';

interface CostChartProps {
  items: CostItem[];
}

const CostChart: React.FC<CostChartProps> = ({ items }) => {
  // Aggregate by category
  const data = items.reduce((acc, item) => {
    const existing = acc.find(i => i.name === item.category);
    if (existing) {
      existing.value += item.amount;
    } else {
      acc.push({ name: item.category, value: item.amount });
    }
    return acc;
  }, [] as { name: string; value: number }[]);

  // Color mapping for specific categories
  const getColor = (name: string) => {
      switch(name) {
          case 'Lavoro': return '#64748b'; // Slate
          case 'Viaggio': return '#3b82f6'; // Blue
          case 'Vitto/Alloggio': return '#f97316'; // Orange
          default: return '#94a3b8';
      }
  };

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.name)} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CostChart;
