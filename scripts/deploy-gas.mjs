import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const positional = [];
  let target = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target' && argv[i + 1]) {
      target = argv[++i].trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    } else if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    } else {
      positional.push(arg);
    }
  }

  return { command: positional[0] || 'help', args: positional.slice(1), target };
}

function getConfigPath(target) {
  return path.join(root, target ? `.clasp.${target}.json` : '.clasp.json');
}

function runClasp(claspArgs) {
  const isWin = process.platform === 'win32';
  const rawArgs = ['--yes', '@google/clasp', ...claspArgs];
  const safeArgs = isWin
    ? rawArgs.map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
    : rawArgs;
  const result = spawnSync(
    isWin ? 'npx.cmd' : 'npx',
    safeArgs,
    {
      cwd: root,
      stdio: 'inherit',
      shell: isWin,
    }
  );
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 0;
}

function readClaspConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    console.error(`Configuratiebestand niet gevonden: ${path.basename(configPath)}`);
    console.error('Maak eerst een koppeling aan met:');
    console.error('  npm run gas:init -- <SCRIPT_ID> [DEPLOYMENT_ID] [--target test|mel]');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function printHelp() {
  console.log(`PokéBinder Google Apps Script (clasp) helper

Gebruik:
  npm run gas:login
  npm run gas:init -- <SCRIPT_ID> [DEPLOYMENT_ID] [--target test|mel]
  npm run gas:push -- [--target test|mel]
  npm run gas:deploy -- [--target test|mel]
  npm run gas:deployments -- [--target test|mel]
`);
}

function main() {
  const { command, args, target } = parseArgs(process.argv.slice(2));
  const configPath = getConfigPath(target);

  switch (command) {
    case 'login': {
      console.log('Let op: zorg dat de Google Apps Script API 1x aan staat op:');
      console.log('  https://script.google.com/home/usersettings\n');
      process.exit(runClasp(['login']));
      break;
    }

    case 'init': {
      const scriptId = (args[0] || '').trim();
      const deploymentId = (args[1] || '').trim();
      if (!scriptId) {
        console.error('Gebruik: npm run gas:init -- <SCRIPT_ID> [DEPLOYMENT_ID] [--target test|mel]');
        process.exit(1);
      }
      const cfg = {
        scriptId,
        rootDir: 'apps-script',
      };
      if (deploymentId) {
        cfg.deploymentId = deploymentId;
      }
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      console.log(`Opgeslagen in ${path.basename(configPath)} (scriptId: ${scriptId}).`);
      break;
    }

    case 'push': {
      readClaspConfig(configPath);
      const status = runClasp(['-P', configPath, 'push', '--force']);
      process.exit(status);
      break;
    }

    case 'deploy': {
      const cfg = readClaspConfig(configPath);
      const pushStatus = runClasp(['-P', configPath, 'push', '--force']);
      if (pushStatus !== 0) process.exit(pushStatus);

      const stamp = new Date().toISOString().slice(0, 16);
      const deployArgs = ['-P', configPath, 'deploy', '-d', `PokeBinder-${stamp}`];
      if (cfg.deploymentId) {
        deployArgs.push('-i', cfg.deploymentId);
        console.log(`\nBestaande Web App deployment bijwerken (${cfg.deploymentId}) zodat /exec-URL gelijk blijft…`);
      } else {
        console.log('\nGeen deploymentId ingesteld — nieuwe Web App deployment aanmaken…');
        console.log(`Tip: zet het resulterende Deployment-ID als "deploymentId" in ${path.basename(configPath)}.`);
      }
      process.exit(runClasp(deployArgs));
      break;
    }

    case 'deployments': {
      readClaspConfig(configPath);
      process.exit(runClasp(['-P', configPath, 'deployments']));
      break;
    }

    default:
      printHelp();
      break;
  }
}

main();
