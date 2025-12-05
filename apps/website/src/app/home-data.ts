import type { ForwardRefExoticComponent, SVGProps, RefAttributes } from 'react';
import {
  HeartIcon,
  PhotoIcon,
  MapPinIcon,
  UsersIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  ListBulletIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

type HeroIcon = ForwardRefExoticComponent<SVGProps<SVGSVGElement> & RefAttributes<SVGSVGElement>>;

type NavLink = {
  label: string;
  href: string;
  hasDropdown?: boolean;
};

export const NAV_LINKS: NavLink[] = [
  { label: 'Planning Tools', href: '#', hasDropdown: false },
  { label: 'Vendors', href: '/vendors', hasDropdown: true },
  { label: 'Wedding Website', href: '#', hasDropdown: false },
  { label: 'Guests & RSVPs', href: '#', hasDropdown: true },
  { label: 'Attire & Rings', href: '#', hasDropdown: true },
  { label: 'Ideas & Advice', href: '#', hasDropdown: true },
];

type HeroTab = {
  id: string;
  label: string;
  icon: HeroIcon;
};

export const HERO_TABS: HeroTab[] = [
  { id: 'venues', label: 'Venues', icon: MapPinIcon },
  { id: 'vendors', label: 'Vendors', icon: UsersIcon },
  { id: 'photos', label: 'Photos', icon: PhotoIcon },
  { id: 'ideas', label: 'Ideas', icon: HeartIcon },
];

export const POPULAR_TAGS = ['beach wedding', 'modern luxury', 'flowers', 'lace dresses'];

export const HERO_SLIDES = [
  {
    id: 1,
    video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerJoyrides.jpg',
    author: 'Evergreen Films',
    avatar: 'https://picsum.photos/seed/vid1/50/50',
    color: '#e8f4f8',
  },
  {
    id: 2,
    video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg',
    author: 'Love & Lens',
    avatar: 'https://picsum.photos/seed/vid2/50/50',
    color: '#f8e8e8',
  },
  {
    id: 3,
    video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg',
    author: 'Rustic Barns Co.',
    avatar: 'https://picsum.photos/seed/vid3/50/50',
    color: '#e8f8ec',
  },
];

export const CATEGORIES = [
  'Popular',
  'Venues',
  'Photographers',
  'Videographers',
  'Caterers',
  'Wedding Planners',
  'Florists',
  'DJs & Music',
  'Beauty & Makeup',
  'Bridal Salons',
  'Cake & Desserts',
  'Decorators',
];

export const MARQUEE_CATEGORIES = [
  { title: 'Beauty', image: 'https://picsum.photos/seed/beauty/600/400' },
  { title: 'Bridal Salons', image: 'https://picsum.photos/seed/bridal/600/400' },
  { title: 'Caterers', image: 'https://picsum.photos/seed/caterers/600/400' },
  { title: 'Florists', image: 'https://picsum.photos/seed/florists/600/400' },
  { title: 'Officiants', image: 'https://picsum.photos/seed/officiants/600/400' },
  { title: 'Transportation', image: 'https://picsum.photos/seed/transport/600/400' },
  { title: 'Rentals', image: 'https://picsum.photos/seed/rentals/600/400' },
  { title: 'Venues', image: 'https://picsum.photos/seed/venues-marquee/600/400' },
  { title: 'Videographers', image: 'https://picsum.photos/seed/videographers/600/400' },
  { title: 'Wedding Planners', image: 'https://picsum.photos/seed/planners/600/400' },
];

// Planning Tools Data
type PlanningTool = {
  id: string;
  title: string;
  description: string;
  icon: HeroIcon;
  color: string;
  bgColor: string;
  progress?: number;
};

export const PLANNING_TOOLS: PlanningTool[] = [
  {
    id: 'checklist',
    title: 'Wedding Checklist',
    description: 'Stay on track with our comprehensive timeline',
    icon: ListBulletIcon,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/30',
    progress: 68,
  },
  {
    id: 'budget',
    title: 'Budget Planner',
    description: 'Track expenses and manage your wedding finances',
    icon: CurrencyDollarIcon,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    progress: 85,
  },
  {
    id: 'guestlist',
    title: 'Guest List Manager',
    description: 'Organize guests, track RSVPs, and manage seating',
    icon: UsersIcon,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/30',
  },
  {
    id: 'timeline',
    title: 'Wedding Timeline',
    description: 'Create your perfect day-of schedule',
    icon: ClockIcon,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/30',
  },
  {
    id: 'vendor',
    title: 'Vendor Manager',
    description: 'Keep all vendor contacts and contracts organized',
    icon: ClipboardDocumentListIcon,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/30',
  },
  {
    id: 'calendar',
    title: 'Event Calendar',
    description: 'Never miss important wedding-related dates',
    icon: CalendarIcon,
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-50 dark:bg-pink-900/30',
  },
];

type ChecklistItem = {
  id: string;
  task: string;
  category: string;
  dueDate: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
};

export const CHECKLIST_PREVIEW: ChecklistItem[] = [
  {
    id: '1',
    task: 'Book venue',
    category: 'Venue',
    dueDate: '12 months before',
    completed: true,
    priority: 'high',
  },
  {
    id: '2',
    task: 'Send save-the-dates',
    category: 'Invitations',
    dueDate: '6 months before',
    completed: true,
    priority: 'high',
  },
  {
    id: '3',
    task: 'Order wedding cake',
    category: 'Catering',
    dueDate: '3 months before',
    completed: false,
    priority: 'medium',
  },
  {
    id: '4',
    task: 'Finalize seating chart',
    category: 'Planning',
    dueDate: '2 weeks before',
    completed: false,
    priority: 'high',
  },
];

type BudgetCategory = {
  category: string;
  budgeted: number;
  spent: number;
  icon: HeroIcon;
};

export const BUDGET_PREVIEW: BudgetCategory[] = [
  { category: 'Venue', budgeted: 15000, spent: 15000, icon: MapPinIcon },
  { category: 'Catering', budgeted: 12000, spent: 8500, icon: UsersIcon },
  { category: 'Photography', budgeted: 5000, spent: 5000, icon: PhotoIcon },
  { category: 'Flowers', budgeted: 3000, spent: 2200, icon: HeartIcon },
];
