import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';

const suggestions = [
  {
    title: 'Codeforces',
    description:
      'The most popular competitive programming platform with contests, problems, and a vibrant community.',
    url: 'https://codeforces.com',
    category: 'Practice',
    isActive: true,
    order: 1,
  },
  {
    title: 'AtCoder',
    description:
      'Japanese competitive programming contest platform known for high-quality problems.',
    url: 'https://atcoder.jp',
    category: 'Practice',
    isActive: true,
    order: 2,
  },
  {
    title: 'LeetCode',
    description:
      'Practice coding skills with algorithm and data structure challenges for interview prep.',
    url: 'https://leetcode.com',
    category: 'Practice',
    isActive: true,
    order: 3,
  },
  {
    title: 'CSES Problem Set',
    description:
      'Curated collection of 300+ classic competitive programming problems with editorial.',
    url: 'https://cses.fi/problemset/',
    category: 'Practice',
    isActive: true,
    order: 4,
  },
  {
    title: 'CodeChef',
    description:
      'Global competitive programming platform with regular contests and practice sections.',
    url: 'https://www.codechef.com',
    category: 'Practice',
    isActive: true,
    order: 5,
  },
  {
    title: 'CP-Algorithms',
    description:
      'Comprehensive library of algorithms and data structures for competitive programming.',
    url: 'https://cp-algorithms.com',
    category: 'Learning',
    isActive: true,
    order: 6,
  },
  {
    title: 'USACO Guide',
    description:
      'Free, structured curriculum for competitive programming from bronze to platinum.',
    url: 'https://usaco.guide',
    category: 'Learning',
    isActive: true,
    order: 7,
  },
  {
    title: 'VisuAlgo',
    description: 'Visualize data structures and algorithms through animation.',
    url: 'https://visualgo.net',
    category: 'Learning',
    isActive: true,
    order: 8,
  },
  {
    title: "Competitive Programmer's Handbook",
    description: 'Free PDF handbook by Antti Laaksonen covering all CP topics.',
    url: 'https://cses.fi/book/book.pdf',
    category: 'Resources',
    isActive: true,
    order: 9,
  },
  {
    title: 'Codeforces Problemsetter',
    description:
      'Tools and resources for creating competitive programming problems.',
    url: 'https://codeforces.com/blog/entry/69875',
    category: 'Resources',
    isActive: true,
    order: 10,
  },
  {
    title: 'YouTube - Algorithms Live',
    description:
      'Video explanations of competitive programming algorithms and problem-solving techniques.',
    url: 'https://www.youtube.com/@AlgorithmsLive',
    category: 'Learning',
    isActive: true,
    order: 11,
  },
  {
    title: 'GitHub - CP Sheet',
    description:
      'Curated list of competitive programming resources, tutorials, and practice platforms.',
    url: 'https://github.com/lnishan/awesome-competitive-programming',
    category: 'Resources',
    isActive: true,
    order: 12,
  },
];

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const model = app.get(getModelToken('Suggestion'));

  await model.deleteMany({});
  await model.insertMany(suggestions);
  console.log(`Seeded ${suggestions.length} suggestions`);
  await app.close();
}

seed().catch(console.error);
