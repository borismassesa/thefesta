import { ChevronLeft, ChevronRight, Search, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

export function SchedulePanel() {
  return (
    <div className="w-full h-full bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col pt-6 overflow-hidden">
      <div className="px-6 flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">Schedule</h3>
        <div className="flex items-center gap-2">
          <button data-opus-button="control" className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <Search className="w-4 h-4" />
          </button>
          <button data-opus-button="control" className="px-4 py-1.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            See All
          </button>
        </div>
      </div>

      <div className="px-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <button data-opus-button="control" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-900 text-sm">October 2024</span>
          <button data-opus-button="control" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <button data-opus-button="control" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-50 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex text-center gap-1">
            <div className="px-3 py-1 cursor-pointer hover:bg-gray-50 rounded-lg">
              <div className="text-[11px] text-gray-400 font-medium mb-1">Thu</div>
              <div className="text-sm font-medium text-gray-900 leading-none">31</div>
            </div>
            <div className="px-3 py-1 cursor-pointer hover:bg-gray-50 rounded-lg">
              <div className="text-[11px] text-gray-400 font-medium mb-1">Fri</div>
              <div className="text-sm font-medium text-gray-900 leading-none">01</div>
            </div>
            <div className="px-3 py-1 bg-[#C9A0DC] text-white rounded-xl shadow-sm cursor-pointer">
              <div className="text-[11px] font-medium mb-1 opacity-90">Sat</div>
              <div className="text-sm font-semibold leading-none">02</div>
            </div>
            <div className="px-3 py-1 cursor-pointer hover:bg-gray-50 rounded-lg">
              <div className="text-[11px] text-gray-400 font-medium mb-1">Sun</div>
              <div className="text-sm font-medium text-gray-900 leading-none">03</div>
            </div>
            <div className="px-3 py-1 cursor-pointer hover:bg-gray-50 rounded-lg">
              <div className="text-[11px] text-gray-400 font-medium mb-1">Mon</div>
              <div className="text-sm font-medium text-gray-900 leading-none">04</div>
            </div>
          </div>
          <button data-opus-button="control" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-50 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-100 px-6 gap-6 relative">
        <button data-opus-button="control" className="text-sm font-semibold text-gray-900 pb-3 border-b-2 border-gray-900 shrink-0">
          Meetings
        </button>
        <button data-opus-button="control" className="text-sm font-medium text-gray-400 hover:text-gray-600 pb-3 shrink-0 transition-colors">
          Events
        </button>
        <button data-opus-button="control" className="text-sm font-medium text-gray-400 hover:text-gray-600 pb-3 shrink-0 transition-colors">
          Holiday
        </button>
      </div>

      <div className="px-2 py-4 flex-1 overflow-y-auto min-h-0 space-y-1">
        <div className="p-4 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="bg-[#F0DFF6] text-[#7E5896] text-[11px] font-bold px-2.5 py-1 rounded-md">
              Product Design
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
          <h4 className="font-semibold text-gray-900 text-[15px] mb-1">Meeting with Arthur Bell</h4>
          <p className="text-sm text-gray-500 mb-4">09:00 - 09:45 AM (UTC)</p>
          <div className="flex items-center justify-between mt-auto">
             <span className="text-sm font-medium text-gray-600">On Google Meet</span>
             <div className="flex -space-x-2">
                <img className="w-7 h-7 rounded-full border-2 border-white relative z-20" src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop" alt="User" />
                <img className="w-7 h-7 rounded-full border-2 border-white relative z-10" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop" alt="User" />
                <img className="w-7 h-7 rounded-full border-2 border-white relative z-0" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop" alt="User" />
                <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600 relative z-0">
                  +3
                </div>
             </div>
          </div>
        </div>

        <div className="p-4 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="bg-orange-100 text-orange-700 text-[11px] font-bold px-2.5 py-1 rounded-md">
              Brainstorming Session
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
          <h4 className="font-semibold text-gray-900 text-[15px] mb-1">Meeting with Leslie Perez</h4>
        </div>
      </div>
    </div>
  );
}
