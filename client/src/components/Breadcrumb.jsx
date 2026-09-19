import React from 'react';
import { ChevronRight } from 'lucide-react';

// Shared breadcrumb used on every Learn page. Items are passed in order;
// the current page is the last item with no onClick.
export function Breadcrumb({ trail }) {
  return <nav className="breadcrumb" aria-label="Breadcrumb">
    {trail.map((item, index) => <span className="crumb" key={`${item.label}-${index}`}>
      {index > 0 && <ChevronRight size={14} aria-hidden="true"/>}
      {item.onClick ? <button type="button" onClick={item.onClick}>{item.label}</button> : <b aria-current="page">{item.label}</b>}
    </span>)}
  </nav>;
}