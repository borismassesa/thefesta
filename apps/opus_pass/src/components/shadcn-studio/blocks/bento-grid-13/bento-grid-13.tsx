import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Marquee } from '@/components/ui/marquee'
import { MotionPreset } from '@/components/ui/motion-preset'
import { Magnetic } from '@/components/ui/magnet-effect'

import { cn } from '@/lib/utils'
import { assetPath } from '@/lib/asset-path'

import StatCard from '@/components/shadcn-studio/blocks/bento-grid-13/stat-card'
import GoalAndTargetCard from '@/components/shadcn-studio/blocks/bento-grid-13/goal-and-target-card'
import SalesGrowthCard from '@/components/shadcn-studio/blocks/bento-grid-13/sales-growth-card'
import TargetVisibilityRippleBg from '@/components/shadcn-studio/blocks/bento-grid-13/target-visibility-ripple-bg'
import RegularUpdatesCard from '@/components/shadcn-studio/blocks/bento-grid-13/regular-updates-card'
import Link from 'next/link'
import { UsersRoundIcon, ArrowUpRightIcon, ArrowDownLeftIcon, MailCheckIcon, UserIcon, PlusIcon, ChurchIcon, UtensilsIcon, CoffeeIcon, GiftIcon, HeartIcon, ArrowRightIcon } from 'lucide-react'
import type { GuestsFeaturesContent } from '@/lib/cms/guests-features'

const rsvpData = [
  {
    product: 'Attending',
    percentage: 62,
    amount: 186,
    trend: 'up',
    heightClass: 'h-[62%]',
    color: 'bg-[#C9A0DC]'
  },
  {
    product: 'Maybe',
    percentage: 18,
    amount: 54,
    trend: 'down',
    heightClass: 'h-[18%]',
    color: 'bg-[#b97fd0]'
  },
  {
    product: 'Declined',
    percentage: 20,
    amount: 60,
    trend: 'up',
    heightClass: 'h-[20%]',
    color: 'bg-[#C9A0DC]/50'
  }
]

const BentoGrid = ({ content }: { content: GuestsFeaturesContent }) => {
  const cardMap = new Map(content.cards.map((c) => [c.id, c]))
  const rsvps = cardMap.get('rsvps')
  const events = cardMap.get('events')
  const pledges = cardMap.get('pledges')
  return (
    <section data-shadcn-scope className='py-8 sm:py-12 lg:py-16'>
      <div className='mx-auto mb-10 max-w-2xl px-4 text-center sm:mb-14 sm:px-6 lg:px-8'>
        <h2 className='font-serif text-3xl font-medium text-gray-900 md:text-4xl lg:text-5xl'>
          {content.heading}
        </h2>
        <p className='mt-4 text-sm text-gray-600 md:text-base'>
          {content.description}
        </p>
      </div>
      <div className='mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 sm:px-6 md:grid-cols-2 lg:px-8 xl:grid-cols-3'>
        {/* Column 1 */}
        <div className='flex flex-col gap-6'>
          {/* Guest Responses Card */}
          <MotionPreset fade slide={{ direction: 'down', offset: 35 }} transition={{ duration: 0.5 }}>
            <Card className='gap-26.5 shadow-none ring-0'>
              <CardContent className='flex flex-col items-center gap-8'>
                <MotionPreset
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={0.15}
                  transition={{ duration: 0.5 }}
                >
                  <StatCard
                    avatarIcon={
                      <UsersRoundIcon className='size-4' />
                    }
                    title='Total RSVPs'
                    statNumber='300'
                    percentage={12}
                  />
                </MotionPreset>

                <MotionPreset
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={0.3}
                  transition={{ duration: 0.5 }}
                  className='relative flex w-full rounded-xl border px-4 py-6'
                >
                  {rsvpData.map((item, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex grow flex-col gap-2.5 px-3 py-2',
                        index < rsvpData.length - 1 && 'border-r'
                      )}
                    >
                      <span className='text-muted-foreground text-sm'>{item.product}</span>

                      <div className='text-2xl font-medium'>{item.percentage}%</div>
                      <div className='flex min-h-25 flex-1 items-end'>
                        <div className={cn('bg-primary grow rounded-xl', item.heightClass, item.color)}></div>
                      </div>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='text-muted-foreground text-sm'>{item.amount}</span>
                        {item.trend === 'up' ? (
                          <ArrowUpRightIcon className='size-4' />
                        ) : (
                          <ArrowDownLeftIcon className='size-4' />
                        )}
                      </div>
                    </div>
                  ))}
                  <Magnetic
                    range={130}
                    strength={0.25}
                    className='absolute -bottom-14 left-1/2 w-71.5 -translate-x-1/2'
                  >
                    <MotionPreset
                      fade
                      zoom
                      delay={0.75}
                      transition={{ duration: 0.5 }}
                      className='bg-card flex items-center gap-2 rounded-xl border p-4 shadow-lg'
                    >
                      <Avatar className='size-9.5 shadow-md after:border-0'>
                        <AvatarFallback className='bg-[#C9A0DC]/25 text-[#7c3f9c] shrink-0'>
                          <MailCheckIcon className='size-4.5' />
                        </AvatarFallback>
                      </Avatar>
                      <p className='text-muted-foreground text-xs'>
                        Replies are up <span className='text-card-foreground'>32%</span> on last week. 248 guests have
                        confirmed their seats
                      </p>
                    </MotionPreset>
                  </Magnetic>
                </MotionPreset>
              </CardContent>

              <CardContent className='flex flex-col gap-4'>
                <MotionPreset
                  component='h5'
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={0.45}
                  transition={{ duration: 0.5 }}
                  className='text-2xl font-semibold'
                >
                  {rsvps?.title}
                </MotionPreset>
                <MotionPreset
                  component='p'
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={0.6}
                  transition={{ duration: 0.5 }}
                  className='text-muted-foreground text-lg'
                >
                  {rsvps?.description}
                </MotionPreset>
                <Link
                  href={rsvps?.cta_href ?? '#'}
                  className='group mt-1 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#b97fd0] transition-colors hover:text-[#9a5fb5]'
                >
                  {rsvps?.cta_label}
                  <ArrowRightIcon className='size-4 transition-transform group-hover:translate-x-1' />
                </Link>
              </CardContent>
            </Card>
          </MotionPreset>

          {/* Guest Groups Card */}
          <MotionPreset
            fade
            slide={{ direction: 'down', offset: 35 }}
            delay={0.9}
            transition={{ duration: 0.5 }}
            className='h-full'
          >
            <Card className='h-full gap-0 pt-0 shadow-none ring-0'>
              <MotionPreset
                fade
                slide={{ direction: 'down', offset: 35 }}
                delay={1.05}
                transition={{ duration: 0.5 }}
                className='relative flex h-full items-center justify-center'
              >
                <TargetVisibilityRippleBg className='text-border pointer-events-none size-45 select-none' />

                <div className='absolute top-1/2 -translate-y-1/2'>
                  <Avatar className='size-16 rounded-full shadow-lg after:rounded-full'>
                    <AvatarFallback className='bg-background text-[#b97fd0] shrink-0'>
                      <UserIcon className='size-8 stroke-1' />
                    </AvatarFallback>
                  </Avatar>
                  <Badge className='absolute top-0 right-0 size-5 rounded-full px-1'>
                    <PlusIcon className='size-2.5' />
                  </Badge>
                </div>

                <MotionPreset
                  fade
                  className='absolute top-1 left-1/2'
                  motionProps={{
                    animate: {
                      x: '-50%',
                      y: [0, -10, 0],
                      opacity: 1
                    },
                    transition: {
                      y: {
                        duration: 2.2,
                        repeat: Infinity,
                        ease: 'easeOut'
                      },
                      opacity: {
                        duration: 0.5,
                        delay: 1.05
                      }
                    }
                  }}
                >
                  <Badge className='bg-[#C9A0DC] text-[#1A1A1A] border-transparent h-auto gap-2.5 px-3 py-1.5 font-semibold shadow-sm'>
                    <HeartIcon className='size-3.5' />
                    Wedding
                  </Badge>
                </MotionPreset>

                <MotionPreset
                  fade
                  className='absolute top-8 left-15 -rotate-5'
                  motionProps={{
                    animate: {
                      y: [0, -10, 0],
                      opacity: 1
                    },
                    transition: {
                      y: {
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeOut'
                      },
                      opacity: {
                        duration: 0.5,
                        delay: 1.2
                      }
                    }
                  }}
                >
                  <Badge className='bg-background text-foreground border-border h-auto gap-2.5 px-3 py-1.5 transition-shadow duration-200 hover:shadow-sm'>
                    <ChurchIcon className='size-3.5' />
                    Ceremony
                  </Badge>
                </MotionPreset>

                <MotionPreset
                  fade
                  className='absolute bottom-10 left-10 rotate-5'
                  motionProps={{
                    animate: {
                      y: [0, -9, 0],
                      opacity: 1
                    },
                    transition: {
                      y: {
                        duration: 1.9,
                        repeat: Infinity,
                        ease: 'easeOut'
                      },
                      opacity: {
                        duration: 0.5,
                        delay: 1.35
                      }
                    }
                  }}
                >
                  <Badge className='bg-background text-foreground border-border h-auto gap-2.5 px-3 py-1.5 transition-shadow duration-200 hover:shadow-sm'>
                    <UtensilsIcon className='size-3.5' />
                    Reception
                  </Badge>
                </MotionPreset>

                <MotionPreset
                  fade
                  className='absolute top-8 right-5 -rotate-10'
                  motionProps={{
                    animate: {
                      y: [0, -10, 0],
                      opacity: 1
                    },
                    transition: {
                      y: {
                        duration: 2.1,
                        repeat: Infinity,
                        ease: 'easeOut'
                      },
                      opacity: {
                        duration: 0.5,
                        delay: 1.5
                      }
                    }
                  }}
                >
                  <Badge className='bg-background text-foreground border-border h-auto gap-2.5 px-3 py-1.5 transition-shadow duration-200 hover:shadow-sm'>
                    <CoffeeIcon className='size-3.5' />
                    Send-off
                  </Badge>
                </MotionPreset>

                <MotionPreset
                  fade
                  className='absolute right-12 bottom-10 rotate-10'
                  motionProps={{
                    animate: {
                      y: [0, -8, 0],
                      opacity: 1
                    },
                    transition: {
                      y: {
                        duration: 1.8,
                        repeat: Infinity,
                        ease: 'easeOut'
                      },
                      opacity: {
                        duration: 0.5,
                        delay: 1.65
                      }
                    }
                  }}
                >
                  <Badge className='bg-background text-foreground border-border h-auto gap-2.5 px-3 py-1.5 transition-shadow duration-200 hover:shadow-sm'>
                    <GiftIcon className='size-3.5' />
                    Kitchen party
                  </Badge>
                </MotionPreset>
              </MotionPreset>

              <CardContent className='flex flex-col gap-4'>
                <MotionPreset
                  component='h5'
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={1.8}
                  inView={false}
                  transition={{ duration: 0.5 }}
                  className='text-2xl font-semibold'
                >
                  {events?.title}
                </MotionPreset>

                <MotionPreset
                  component='p'
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={1.95}
                  inView={false}
                  transition={{ duration: 0.5 }}
                  className='text-muted-foreground text-lg'
                >
                  {events?.description}
                </MotionPreset>
                <Link
                  href={events?.cta_href ?? '#'}
                  className='group mt-1 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#b97fd0] transition-colors hover:text-[#9a5fb5]'
                >
                  {events?.cta_label}
                  <ArrowRightIcon className='size-4 transition-transform group-hover:translate-x-1' />
                </Link>
              </CardContent>
            </Card>
          </MotionPreset>
        </div>

        {/* Column 2 */}
        <div className='flex h-full flex-col gap-6'>
          {/* Guest Target Card */}
          <MotionPreset fade slide={{ direction: 'down', offset: 35 }} transition={{ duration: 0.5 }}>
            <GoalAndTargetCard />
          </MotionPreset>

          {/* Attendance Trends Card */}
          <MotionPreset
            fade
            slide={{ direction: 'down', offset: 35 }}
            delay={0.6}
            transition={{ duration: 0.5 }}
            className='grow'
          >
            <SalesGrowthCard />
          </MotionPreset>
        </div>

        {/* Column 3 */}
        <div className='flex flex-col gap-6 md:max-xl:col-span-2'>
          {/* Live RSVP Updates Card */}
          <MotionPreset
            fade
            slide={{ direction: 'down', offset: 35 }}
            transition={{ duration: 0.5 }}
            className='flex-1'
          >
            <RegularUpdatesCard />
          </MotionPreset>

          {/* Gift Contributions Card */}
          <MotionPreset
            fade
            slide={{ direction: 'down', offset: 35 }}
            delay={0.6}
            transition={{ duration: 0.5 }}
            className='flex-1'
          >
            <Card className='h-full shadow-none ring-0'>
              <MotionPreset
                fade
                slide={{ direction: 'down', offset: 35 }}
                delay={0.75}
                transition={{ duration: 0.5 }}
                className='flex flex-col gap-1'
              >
                <Marquee pauseOnHover reverse duration={30} gap={0.5} className='px-2 py-1.5'>
                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/cutesy_couple.jpg')}
                        alt='Neema Abdallah'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>NA</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>09:15</span>
                      <span className='text-sm'>Neema A.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 200K</span>
                  </div>

                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/churchcouples.jpg')}
                        alt='Amani Mushi'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>AM</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>11:45</span>
                      <span className='text-sm'>Amani M.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 220K</span>
                  </div>

                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/coupleswithpiano.jpg')}
                        alt='Bakari Temu'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>BT</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>14:45</span>
                      <span className='text-sm'>Bakari T.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 150K</span>
                  </div>
                </Marquee>

                <Marquee pauseOnHover duration={30} gap={0.5} className='px-2 py-1.5'>
                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/authentic_couple.jpg')}
                        alt='Joyce Paulo'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>JP</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>19:15</span>
                      <span className='text-sm'>Joyce P.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 80K</span>
                  </div>

                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/couples_together.jpg')}
                        alt='Faith Rwegasira'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>FR</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>18:30</span>
                      <span className='text-sm'>Faith R.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 75K</span>
                  </div>

                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/beautiful_bride.jpg')}
                        alt='Daniel Lyimo'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>DL</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>09:15</span>
                      <span className='text-sm'>Daniel L.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 325K</span>
                  </div>
                </Marquee>

                <Marquee pauseOnHover reverse duration={30} gap={0.5} className='px-2 py-1.5'>
                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/beautyinbride.jpg')}
                        alt='Grace Mremi'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>GM</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>10:30</span>
                      <span className='text-sm'>Grace M.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 180K</span>
                  </div>

                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/bride_umbrella.jpg')}
                        alt='Peter Kessy'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>PK</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>13:20</span>
                      <span className='text-sm'>Peter K.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 95K</span>
                  </div>

                  <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                    <Avatar className='size-9.5 rounded-[var(--opus-radius-small)] after:border-0'>
                      <AvatarImage
                        src={assetPath('/assets/images/brideincar.jpg')}
                        alt='Asha Ndossi'
                        className='rounded-[var(--opus-radius-small)]'
                      />
                      <AvatarFallback className='text-xs'>AN</AvatarFallback>
                    </Avatar>
                    <div className='flex flex-1 flex-col items-start gap-0.5'>
                      <span className='text-muted-foreground text-xs font-light'>16:05</span>
                      <span className='text-sm'>Asha N.</span>
                    </div>
                    <span className='text-green-600 dark:text-green-400'>TSh 260K</span>
                  </div>
                </Marquee>
              </MotionPreset>

              <CardContent className='flex flex-col gap-4'>
                <MotionPreset
                  component='h5'
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={0.9}
                  inView={false}
                  transition={{ duration: 0.5 }}
                  className='text-2xl font-semibold'
                >
                  {pledges?.title}
                </MotionPreset>

                <MotionPreset
                  component='p'
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={1.05}
                  inView={false}
                  transition={{ duration: 0.5 }}
                  className='text-muted-foreground text-lg'
                >
                  {pledges?.description}
                </MotionPreset>
                <Link
                  href={pledges?.cta_href ?? '#'}
                  className='group mt-1 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#b97fd0] transition-colors hover:text-[#9a5fb5]'
                >
                  {pledges?.cta_label}
                  <ArrowRightIcon className='size-4 transition-transform group-hover:translate-x-1' />
                </Link>
              </CardContent>
            </Card>
          </MotionPreset>
        </div>
      </div>
    </section>
  )
}

export default BentoGrid
