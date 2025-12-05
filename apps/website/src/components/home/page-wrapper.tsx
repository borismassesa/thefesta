'use client';

import { useState, useEffect, ReactNode } from 'react';
import ScrolledNavbar from './scrolled-navbar';

type PageWrapperProps = {
  children: ReactNode;
};

const PageWrapper = ({ children }: PageWrapperProps) => {
  const [showScrolledNav, setShowScrolledNav] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show scrolled navbar when scrolled past 600px (roughly past hero section)
      const scrollPosition = window.scrollY;
      setShowScrolledNav(scrollPosition > 600);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <ScrolledNavbar isVisible={showScrolledNav} />
      {children}
    </>
  );
};

export default PageWrapper;
