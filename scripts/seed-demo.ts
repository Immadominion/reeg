// Seed the acceptance demo: create a Machine, run a scripted agent, checkpoint, fork.
// Scaffold only: implementation lands in build-roadmap phases G and J.

function main() {
  const network = process.env.REEG_NETWORK ?? 'testnet';
  console.log(`reeg: would seed a demo Machine on ${network} (scaffold only)`);
}

main();
