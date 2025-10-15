import { getUserInterests, updateUserInterests } from "../db";

export async function updateInterestProfile(userId: string, topic: string) {
  const interests = await getUserInterests(userId);
  const newInterests = { ...interests };


  newInterests[topic] = Math.min(1, (newInterests[topic] || 0.5) + 0.1);

  
  for (const key of Object.keys(newInterests)) {
    if (key !== topic) {
      newInterests[key] = Math.max(0.1, newInterests[key] - 0.02);
    }
  }

  await updateUserInterests(userId, newInterests);
  return newInterests;
}

export async function getRankedTopics(userId: string) {
  const interests = await getUserInterests(userId);
  return Object.entries(interests)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([topic]) => topic);
}
