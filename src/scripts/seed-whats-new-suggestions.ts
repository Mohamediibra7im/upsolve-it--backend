import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = app.get(getModelToken('WhatsNewEntry')) as any;

  const entry = await model.findOne({ title: 'Suggested Websites' }).exec();
  if (entry) {
    console.log('WhatsNew entry for Suggestions already exists, skipping.');
    await app.close();
    return;
  }

  await model.create({
    title: 'Suggested Websites',
    content: 'Discover curated resources to boost your competitive programming journey. We\'ve added a collection of hand-picked websites including practice platforms, learning resources, and reference materials.\n\n**What\'s New:**\n- **Practice Platforms**: Codeforces, AtCoder, LeetCode, CSES, CodeChef\n- **Learning Resources**: CP-Algorithms, USACO Guide, VisuAlgo\n- **Reference Materials**: Competitive Programmer\'s Handbook, GitHub CP Sheet\n\nAccess them anytime via the globe icon in the floating action buttons.',
    version: '2026.6',
    isPublished: true,
    publishedAt: new Date(),
  });

  console.log('Created WhatsNew entry for Suggestions');
  await app.close();
}

seed().catch(console.error);
