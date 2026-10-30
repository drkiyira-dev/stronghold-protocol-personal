// Personal, single-player transport for Stronghold Protocol (GPL-3.0).
// The upstream Lobby, Network, Match, economy and battle rules run unchanged.
// Transport: postMessage(C2S object) -> postMessage(original S2C object).
// Additional lifecycle frames: local.ready, local.error, local.closed.
import { Lobby } from '../upstream/server/lobby.js';
import { Network, SessionRegistry } from '../upstream/server/net.js';
import { setSimData } from '../upstream/server/sim/simdata.js';
import { setData } from './shims/data.mjs';
import { Match } from '../upstream/server/match/Match.js';
import { captureCheckpoint, restoreCheckpoint, validateCheckpoint, checkpointCompatibility } from './checkpoint.mjs';
import {validateChallenge,challengeViolation} from './challenges.mjs';

const DATA_FILES = [
  'config', 'chess', 'bonds', 'garrisons', 'items', 'bands', 'effects', 'choices',
  'enemies', 'factions', 'waves', 'stages', 'bosses', 'tokens', 'backups', 'tuning',
];
const MULTIPLAYER_ONLY = new Set([
  'room.join', 'room.spectate', 'room.addBot', 'room.removeBot', 'room.kick',
  'room.takeover', 'room.matchmake', 'room.matchmaking',
]);

export async function createLocalServer({ emit, fetchData, data: suppliedData, now = Date.now } = {}) {
  if (typeof emit !== 'function') throw new TypeError('createLocalServer requires emit(message).');
  const data = suppliedData || Object.fromEntries(await Promise.all(DATA_FILES.map(async file => {
    const value = await fetchData(file);
    if (!value || typeof value !== 'object') throw new Error(`数据文件不可用：${file}.json`);
    return [file, value];
  })));
  setData(data);
  setSimData(data);
  const registry = new SessionRegistry({ now });
  let preferredIdentity = null, restoring = null, saveQueued = false, lastSaved = '', stopped = false;
  let challenge = null;
  const createSession = registry.create.bind(registry);
  registry.create = name => {
    const session = createSession(name);
    if (session && preferredIdentity && registry.size === 1) {
      registry.byPlayerId.delete(session.playerId);
      session.playerId = preferredIdentity;
      registry.byPlayerId.set(session.playerId, session);
    }
    return session;
  };
  const log = { info() {}, debug() {}, warn: (...args) => console.warn(...args), error: (...args) => console.error(...args) };
  class LocalMatch {
    constructor(options) {
      if (!restoring) {const match=new Match({...options,...(challenge?{seed:challenge.seed,difficulty:challenge.difficulty}:{})});match.personalChallenge=challenge;return match;}
      const snapshot = { ...restoring, options: { ...restoring.options, roomCode: options.roomCode } };
      const match = restoreCheckpoint(snapshot, {
        data, now, log, send: options.send, broadcast: options.broadcast, onEnd: options.onEnd,
      });
      match.start = () => { match.onReconnect(options.seats[0].playerId); match.flush(true); };
      return match;
    }
  }
  const lobby = new Lobby({ registry, MatchClass: LocalMatch, getData: () => data, now, log, options: { maxRooms: 2 } });
  function saveSoon() {
    if (saveQueued || stopped) return;
    saveQueued = true;
    queueMicrotask(() => {
      saveQueued = false;
      if (stopped) return;
      const match = [...lobby.rooms.values()].find(room => room.match)?.match;
      if (!match || match.phase !== 'PREP' || match.order[0]?.ready || match._prepEndQueued) return;
      try {
        const snapshot = captureCheckpoint(match);
        const signature = JSON.stringify(snapshot.state);
        if (signature === lastSaved) return;
        lastSaved = signature;
        emit({ t: 'local.checkpoint', snapshot });
      } catch (error) { emit({ t: 'local.save-unavailable', message: error.message }); }
    });
  }
  function restore(snapshot) {
    try {
      validateCheckpoint(snapshot, data);
      const session = [...registry.byPlayerId.values()][0];
      if (!session || session.playerId !== snapshot.options.seats[0].playerId) throw new Error('存档身份不匹配，请重新打开页面。');
      if (lobby.roomOf(session)?.match) throw new Error('请先离开当前模拟。');
      const created = lobby.create(session, { mode: 'solo', difficulty: snapshot.options.difficulty });
      if (!created.ok) throw new Error(created.detail || created.error);
      restoring = snapshot;
      const started = lobby.startMatch(lobby.roomOf(session));
      if (!started.ok) throw new Error(started.detail || started.error);
      challenge = snapshot.challenge || null;
      emit({ t: 'local.restored', round: snapshot.round });
      saveSoon();
    } catch (error) { emit({ t: 'local.restore-error', message: error.message }); }
    finally { restoring = null; }
  }
  const handler = {
    onHello: (...args) => lobby.onHello(...args),
    onDisconnect: (...args) => lobby.onDisconnect(...args),
    onExpire: (...args) => lobby.onExpire(...args),
    welcomeInfo: () => lobby.welcomeInfo(),
    routeGame(session,message) {
      const match=lobby.roomOf(session)?.match;
      const error=challengeViolation(match?.personalChallenge,message,match?.order.find(p=>p.playerId===session.playerId));
      if(error)return {error:'BAD_MSG',detail:error};
      return lobby.routeGame(session,message);
    },
    onMessage(session, message) {
      if(challenge&&message.t==='room.create')message={...message,difficulty:challenge.difficulty};
      if(challenge&&message.t==='room.setDifficulty')return {error:'BAD_MSG',detail:'请在挑战工坊中设置挑战难度'};
      const match=lobby.roomOf(session)?.match;
      const violation=challengeViolation(match?.personalChallenge,message,match?.order.find(p=>p.playerId===session.playerId));
      if(violation)return {error:'BAD_MSG',detail:violation};
      if (MULTIPLAYER_ONLY.has(message.t) || (message.t === 'room.create' && message.mode !== 'solo') || (message.t === 'room.setMode' && message.mode !== 'solo')) {
        return { error: 'BAD_MSG', detail: '个人站点仅支持独立模拟，不提供联机房间。' };
      }
      return lobby.onMessage(session, message);
    },
  };
  const network = new Network({ registry, handler, now, log, options: { maxConnections: 1, maxOnline: 1, helloTimeoutMs: 120000 } });
  function connectTransport() {
    const listeners = new Map();
    const socket = {
      readyState: 1, bufferedAmount: 0,
      on(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
      send(raw) {
        const message = JSON.parse(raw);
        const activeChallenge=[...lobby.rooms.values()].find(room=>room.match)?.match?.personalChallenge;
        if(message.t==='m.result' && activeChallenge){message.test=true;message.personalChallenge=activeChallenge;}
        emit(message);
        if (message.t === 'm.result') { lastSaved = ''; emit({ t: 'local.clear-checkpoint' }); }
        saveSoon();
      },
      ping() { for (const fn of listeners.get('pong') || []) fn(); },
      close(code = 1000, reason = '') {
        if (this.readyState !== 1) return;
        this.readyState = 3;
        for (const fn of listeners.get('close') || []) fn();
        emit({ t: 'local.closed', code, reason });
      },
      terminate() { this.close(1001, 'Local transport closed.'); },
    };
    network.handleConnection(socket, { socket: { remoteAddress: '127.0.0.1' }, headers: {} });
    return { socket, listeners };
  }
  let transport = connectTransport();
  return {
    receive(message) {
      if (stopped) return;
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.t === 'local.identity') {
        if (!registry.size && /^p_[a-zA-Z0-9_]{1,60}$/.test(message.playerId)) preferredIdentity = message.playerId;
        return;
      }
      if (message.t === 'local.restore') { restore(message.snapshot); return; }
      if (message.t === 'local.challenge') {
        try {
          if([...lobby.rooms.values()].some(r=>r.match))throw new Error('请先离开当前对局再切换挑战');
          challenge=message.challenge ? validateChallenge(message.challenge,data.chess) : null;
          emit({t:'local.challenge-set',challenge});
        }catch(error){emit({t:'local.challenge-error',message:error.message});}
        return;
      }
      // The original host closes idle pre-hello connections. A later browser
      // reconnect needs a fresh Connection, while keeping this lobby and its
      // sessions/match intact. Before Start, the client probes with ping rather
      // than hello; both must recover a closed transport.
      if ((message.t === 'hello' || message.t === 'ping') && transport.socket.readyState !== 1) transport = connectTransport();
      for (const fn of transport.listeners.get('message') || []) fn(JSON.stringify(message), false);
      saveSoon();
    },
    dispose() {
      if (stopped) return;
      stopped = true;
      for (const room of lobby.rooms.values()) room.match?.dispose();
      network.close();
      for (const timer of lobby.graceTimers.values()) clearTimeout(timer);
      for (const timer of lobby.resyncTimers.values()) clearTimeout(timer);
    },
    // Introspection is kept inside the worker / tests, never attached to window.
    lobby, registry, compatibility:checkpointCompatibility(data),
  };
}

// In browsers this module is the worker entry; importing in a test is inert.
if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  for (const level of ['warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      self.postMessage({ t: 'local.log', level, message: args.map(value => value?.stack || (typeof value === 'string' ? value : JSON.stringify(value))).join(' ').slice(0, 2000) });
    };
  }
  const queued = [];
  let server = null;
  let failed = null;
  self.onmessage = ({ data }) => {
    if (data?.t === 'local.dispose') { server?.dispose(); self.close(); return; }
    if (failed) { self.postMessage({ t: 'local.error', message: failed }); return; }
    if (server) server.receive(data);
    else queued.push(data);
  };
  createLocalServer({
    emit: message => self.postMessage(message),
    fetchData: async file => {
      const response = await fetch(`/data/${file}.json`);
      if (!response.ok) throw new Error(`读取 ${file}.json 失败（${response.status}）`);
      return response.json();
    },
  }).then(value => {
    server = value;
    self.postMessage({ t: 'local.ready',compatibility:value.compatibility });
    queued.splice(0).forEach(message => server.receive(message));
  }).catch(error => {
    failed = error?.message || String(error);
    self.postMessage({ t: 'local.error', message: failed });
  });
}
