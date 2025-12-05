import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create vendor categories
  const categories = [
    { name: 'Photographers', slug: 'photographers', description: 'Professional wedding and event photographers' },
    { name: 'Venues', slug: 'venues', description: 'Wedding and event venues' },
    { name: 'Caterers', slug: 'caterers', description: 'Food and beverage services' },
    { name: 'Salons & Make-up', slug: 'salons-makeup', description: 'Hair and beauty services' },
    { name: 'Decor', slug: 'decor', description: 'Event decoration and styling' },
    { name: 'DJs & MCs', slug: 'djs-mcs', description: 'Music and entertainment' },
    { name: 'Rentals', slug: 'rentals', description: 'Equipment and furniture rentals' },
    { name: 'Designers', slug: 'designers', description: 'Wedding dress and suit designers' },
    { name: 'Transport', slug: 'transport', description: 'Transportation services' },
  ];

  for (const category of categories) {
    await prisma.vendorCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  // Create event templates
  const eventTemplates = [
    {
      name: 'Traditional Wedding',
      type: 'wedding',
      description: 'Complete checklist for a traditional Tanzanian wedding',
      checklist: [
        { id: '1', title: 'Choose wedding date', completed: false, priority: 'high' },
        { id: '2', title: 'Book venue', completed: false, priority: 'high' },
        { id: '3', title: 'Hire photographer', completed: false, priority: 'high' },
        { id: '4', title: 'Book caterer', completed: false, priority: 'high' },
        { id: '5', title: 'Choose wedding dress', completed: false, priority: 'medium' },
        { id: '6', title: 'Book DJ/MC', completed: false, priority: 'medium' },
        { id: '7', title: 'Send invitations', completed: false, priority: 'medium' },
        { id: '8', title: 'Plan decorations', completed: false, priority: 'low' },
        { id: '9', title: 'Book transportation', completed: false, priority: 'low' },
        { id: '10', title: 'Final venue walkthrough', completed: false, priority: 'low' },
      ],
      budgetItems: [
        { id: '1', category: 'Venue', budget: 0, spent: 0 },
        { id: '2', category: 'Photography', budget: 0, spent: 0 },
        { id: '3', category: 'Catering', budget: 0, spent: 0 },
        { id: '4', category: 'Attire', budget: 0, spent: 0 },
        { id: '5', category: 'Entertainment', budget: 0, spent: 0 },
        { id: '6', category: 'Decorations', budget: 0, spent: 0 },
        { id: '7', category: 'Transportation', budget: 0, spent: 0 },
        { id: '8', category: 'Miscellaneous', budget: 0, spent: 0 },
      ],
    },
    {
      name: 'Kitchen Party',
      type: 'kitchen_party',
      description: 'Checklist for a traditional kitchen party',
      checklist: [
        { id: '1', title: 'Choose date and venue', completed: false, priority: 'high' },
        { id: '2', title: 'Plan menu and hire caterer', completed: false, priority: 'high' },
        { id: '3', title: 'Book photographer', completed: false, priority: 'medium' },
        { id: '4', title: 'Plan decorations', completed: false, priority: 'medium' },
        { id: '5', title: 'Send invitations', completed: false, priority: 'medium' },
        { id: '6', title: 'Book DJ', completed: false, priority: 'low' },
        { id: '7', title: 'Plan activities', completed: false, priority: 'low' },
      ],
      budgetItems: [
        { id: '1', category: 'Venue', budget: 0, spent: 0 },
        { id: '2', category: 'Catering', budget: 0, spent: 0 },
        { id: '3', category: 'Photography', budget: 0, spent: 0 },
        { id: '4', category: 'Decorations', budget: 0, spent: 0 },
        { id: '5', category: 'Entertainment', budget: 0, spent: 0 },
        { id: '6', category: 'Miscellaneous', budget: 0, spent: 0 },
      ],
    },
  ];

  for (const template of eventTemplates) {
    await prisma.eventTemplate.upsert({
      where: { 
        name_type: {
          name: template.name,
          type: template.type,
        }
      },
      update: {},
      create: template,
    });
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
