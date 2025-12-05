'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DollarSign,
  TrendingUp,
  Users,
  Star,
  Calendar,
  MessageSquare,
  Eye,
  Clock,
} from 'lucide-react';

// Mock data - in production this would come from your API
const stats = [
  {
    title: 'Total Revenue',
    value: 'TSh 2,450,000',
    change: '+12.5%',
    changeType: 'positive' as const,
    icon: DollarSign,
  },
  {
    title: 'Active Bookings',
    value: '24',
    change: '+8.2%',
    changeType: 'positive' as const,
    icon: Calendar,
  },
  {
    title: 'Total Clients',
    value: '156',
    change: '+5.1%',
    changeType: 'positive' as const,
    icon: Users,
  },
  {
    title: 'Average Rating',
    value: '4.8',
    change: '+0.2',
    changeType: 'positive' as const,
    icon: Star,
  },
];

const recentBookings = [
  {
    id: 'BK001',
    client: 'Sarah & Michael',
    event: 'Wedding',
    date: '2024-03-15',
    status: 'confirmed',
    amount: 850000,
  },
  {
    id: 'BK002',
    client: 'Grace & David',
    event: 'Kitchen Party',
    date: '2024-03-22',
    status: 'pending',
    amount: 450000,
  },
  {
    id: 'BK003',
    client: 'Mary & James',
    event: 'Sendoff',
    date: '2024-03-28',
    status: 'completed',
    amount: 650000,
  },
  {
    id: 'BK004',
    client: 'Lisa & Peter',
    event: 'Wedding',
    date: '2024-04-05',
    status: 'confirmed',
    amount: 920000,
  },
];

const recentMessages = [
  {
    id: 1,
    client: 'Sarah M.',
    message: 'Hi! I love your portfolio. Are you available for my wedding in March?',
    time: '2 min ago',
    unread: true,
  },
  {
    id: 2,
    client: 'Grace K.',
    message: 'Thank you for the beautiful photos! When will the full gallery be ready?',
    time: '1 hour ago',
    unread: false,
  },
  {
    id: 3,
    client: 'Mary L.',
    message: 'Can we schedule a consultation call for next week?',
    time: '3 hours ago',
    unread: true,
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'completed':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    minimumFractionDigits: 0,
  }).format(amount);
};

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's what's happening with your business.
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">
            <Eye className="h-4 w-4 mr-2" />
            View Analytics
          </Button>
          <Button size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            New Message
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                <span
                  className={
                    stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                  }
                >
                  {stat.change}
                </span>{' '}
                from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Bookings
              <Button variant="outline" size="sm">
                View All
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div>
                        <p className="font-medium text-foreground">{booking.client}</p>
                        <p className="text-sm text-muted-foreground">{booking.event}</p>
                      </div>
                      <Badge className={getStatusColor(booking.status)}>
                        {booking.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {booking.date}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">
                      {formatCurrency(booking.amount)}
                    </p>
                    <p className="text-sm text-muted-foreground">ID: {booking.id}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Messages
              <Button variant="outline" size="sm">
                View All
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentMessages.map((message) => (
                <div
                  key={message.id}
                  className={`p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors ${
                    message.unread ? 'bg-accent/10 border-accent/20' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-foreground text-xs font-medium">
                        {message.client.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground">{message.client}</p>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground">{message.time}</span>
                          {message.unread && (
                            <div className="h-2 w-2 bg-primary rounded-full"></div>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {message.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto p-6 flex flex-col items-center space-y-2">
              <Calendar className="h-8 w-8 text-primary" />
              <span>View Calendar</span>
              <span className="text-xs text-muted-foreground">Check availability</span>
            </Button>
            <Button variant="outline" className="h-auto p-6 flex flex-col items-center space-y-2">
              <DollarSign className="h-8 w-8 text-primary" />
              <span>Create Invoice</span>
              <span className="text-xs text-muted-foreground">Bill your clients</span>
            </Button>
            <Button variant="outline" className="h-auto p-6 flex flex-col items-center space-y-2">
              <TrendingUp className="h-8 w-8 text-primary" />
              <span>View Analytics</span>
              <span className="text-xs text-muted-foreground">Track performance</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
