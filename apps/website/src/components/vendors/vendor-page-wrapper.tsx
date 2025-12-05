'use client';

import { useState } from 'react';
import Navbar from '../home/navbar';

interface VendorPageWrapperProps {
  children: React.ReactNode;
  isNavHidden: boolean;
}

const VendorPageWrapper = ({ children, isNavHidden }: VendorPageWrapperProps) => {
  return (
    <>
      {/* Main Navbar - Hidden when tabs are sticky */}
      <div
        className={`transition-all duration-300 ${
          isNavHidden ? '-translate-y-full opacity-0 pointer-events-none absolute' : 'translate-y-0 opacity-100 relative'
        }`}
        style={{ top: 0, left: 0, right: 0, zIndex: 40 }}
      >
        <Navbar />
      </div>

      {children}
    </>
  );
};

export default VendorPageWrapper;
