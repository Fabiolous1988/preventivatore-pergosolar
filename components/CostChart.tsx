
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CostItem } from '../types';

interface CostChartProps {
  items: CostItem[];
}

const COLORS_PALETTE = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
];

const CostChart: React.FC<CostChartProps> = ({ items }) => {
  // Aggregate by category
  const data = items.reduce((acc, item) => {
    // Normalize category name to handle casing issues
    const cat = item.category?.trim() || 'Altro';
    const existing = acc.find(i => i.name === cat);
    if (existing) {
      existing.value += item.amount;
    } else {
      acc.push({ name: cat, value: item.amount });
    }
    return acc;
  }, [] as { name: string; value: number }[]);

  // Vivid Color mapping
  const getColor = (name: string, index: number) => {
      const lower = name.toLowerCase();
      if (lower.includes('lavoro') || lower.includes('manodopera')) return '#3b82f6'; // Vivid Blue
      if (lower.includes('viaggio') || lower.includes('trasport')) return '#10b981'; // Vivid Emerald
      if (lower.includes('vitto') || lower.includes('alloggio') || lower.includes('hotel')) return '#f59e0b'; // Vivid Amber
      if (lower.includes('material') || lower.includes('muletto')) return '#8b5cf6'; // Vivid Violet
      
      // Fallback to palette loop for unknown categories
      return COLORS_PALETTE[index % COLORS_PALETTE.length];
  };

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="40%" // Move chart slightly left to make room for legend
            cy="50%"
            labelLine={false}
            outerRadius={75} // Slightly smaller radius
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.name, index)} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => `€${value.toFixed(2)}`} 
            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
          />
          <Legend 
            layout="vertical" 
            verticalAlign="middle" 
            align="right"
            wrapperStyle={{ paddingLeft: '10px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CostChart;
