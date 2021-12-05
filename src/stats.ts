import {DamageEvent, GameEvent, KillEvent, Member, TeamEvent} from "./events";
import {DamageSource} from "./damageSource";

const TICK_RATE: number = 30;
const TRADE_WINDOW: number = TICK_RATE * 5; // 5 second trade window

const ATTACKER_MAX_HEALTH = 150;
const DEFENDER_MAX_HEALTH = 100;

function getMaxHealth(side: number): number { return side === 0 ? ATTACKER_MAX_HEALTH : DEFENDER_MAX_HEALTH; }

export interface IUser {
    kills: number;
    teamKills: number;
    assists: number;
    deaths: number;
    openingKills: number;
    openingKillAttempts: number;
    atkDamageDealt: number;
    defDamageDealt: number;
    tradeKills: number;
    timesTraded: number;
    atkRoundsPlayed: number;
    defRoundsPlayed: number;
    kastCount: number; // Counter for rounds in which player gets kill, assist, save, or trade
    percentDamageDealtByWeapon: {[weaponId: number]: number};
}


export class User implements IUser{
    public kills: number = 0;
    public teamKills: number = 0;
    public assists: number = 0;
    public deaths: number = 0;
    public openingKills: number = 0;
    public openingKillAttempts: number = 0;
    public atkDamageDealt: number = 0;
    public defDamageDealt: number = 0;
    public tradeKills: number = 0;
    public timesTraded: number = 0;
    public kastCount: number = 0;

    // These stats are only counted at the match level
    public atkRoundsPlayed: number = 0;
    public defRoundsPlayed: number = 0;

    public percentDamageDealtByWeapon: {[weaponId: number]: number} = {};
    public damageReceived: {[entityId: number]: number} = {};

    // Add stats from another user object
    public addStats(user: User) {
        this.kills += user.kills;
        this.teamKills += user.teamKills;
        this.assists += user.assists;
        this.deaths += user.deaths;
        this.openingKills += user.openingKills;
        this.openingKillAttempts += user.openingKillAttempts;
        this.atkDamageDealt += user.atkDamageDealt;
        this.defDamageDealt += user.defDamageDealt;
        this.tradeKills += user.tradeKills;
        this.timesTraded += user.timesTraded;
        this.kastCount += user.kastCount;
        Object.keys(user.percentDamageDealtByWeapon).map(Number).forEach(weaponId => {
            if (!this.percentDamageDealtByWeapon[weaponId]) {
                this.percentDamageDealtByWeapon[weaponId] = 0;
            }
            this.percentDamageDealtByWeapon[weaponId] += user.percentDamageDealtByWeapon[weaponId];
        });
    }

    public static getFavoriteWeapon(user: User) {
        if (user === null || user === undefined) return "N/A";

        let weaponId = -1;
        let damage = -1;
        if (user.percentDamageDealtByWeapon) {
            Object.keys(user.percentDamageDealtByWeapon).map(Number).forEach(potentialWeaponId => {
                if (user.percentDamageDealtByWeapon[potentialWeaponId] > damage) {
                    weaponId = potentialWeaponId;
                    damage = user.percentDamageDealtByWeapon[potentialWeaponId];
                }
            });
        }
        return weaponId !== -1 ? DamageSource[weaponId] : "N/A";
    }
}

export interface ITeam {
    wins: number;
    userNames: {[entityId: number]: string};
    readonly teamNumber: number;
    name: string;
}

export class Team implements ITeam {
    public wins: number = 0;
    public userNames: {[entityId: number]: string} = {};
    readonly teamNumber: number;
    public name: string;

    constructor(teamNumber: number) {
        this.teamNumber = teamNumber;
        this.name = `Team ${teamNumber}`;
    }
}

export interface KillLog {
    readonly tick: number;
    readonly attackerId: number;
    readonly attackerSide: number;
    readonly victimId: number;
    readonly victimSide: number;
}

export class Round {
    readonly round: number;
    public users: {[entityId: number]: User} = {};
    public participants: number[] = [];

    public kills: KillLog[] = []; // Kills are stored in order of newest -> oldest

    constructor(round: number) {
        this.round = round;
    }

    public addDamage(damageEvent: DamageEvent) {
        if (damageEvent.attackerSide === damageEvent.victimSide) return;

        let attacker = this.getOrCreateUser(damageEvent.attackerId);

        // Add damage dealt
        if (damageEvent.attackerSide === 0) {
            attacker.atkDamageDealt += damageEvent.damageDealt;
        } else {
            attacker.defDamageDealt += damageEvent.damageDealt;
        }

        // Add damage dealt by weapon
        if (!attacker.percentDamageDealtByWeapon[damageEvent.damageSource]) {
            attacker.percentDamageDealtByWeapon[damageEvent.damageSource] = 0;
        }
        let victimHealth = getMaxHealth(damageEvent.victimSide);
        attacker.percentDamageDealtByWeapon[damageEvent.damageSource] += (damageEvent.damageDealt / victimHealth);

        let victim = this.getOrCreateUser(damageEvent.victimId);
        if (!victim.damageReceived[damageEvent.attackerId]) {
            victim.damageReceived[damageEvent.attackerId] = 0;
        }
        victim.damageReceived[damageEvent.attackerId] += damageEvent.damageDealt;
    }

    public addKill(killEvent: KillEvent) {
        let victim = this.getOrCreateUser(killEvent.victimId);
        victim.deaths += 1;

        // Rewards assists to people who did 30% or more damage to the victim
        let minAssistDmg = getMaxHealth(killEvent.victimSide) * .3;
        Object.keys(victim.damageReceived).map(Number).forEach((entityId: number) => {
            if (entityId === killEvent.attackerId || entityId === killEvent.victimId) return;
            if (victim.damageReceived[entityId] >= minAssistDmg) {
                this.getOrCreateUser(entityId).assists += 1;
            }
        });

        if (killEvent.attackerSide === killEvent.victimSide) {
            if (killEvent.attackerId !== killEvent.victimId) {
                this.getOrCreateUser(killEvent.attackerId).teamKills += 1;
            }
            // If this is a team or self kill, don't count it in the rest of the kill metrics
            return;
        }

        let attacker = this.getOrCreateUser(killEvent.attackerId);
        attacker.kills += 1;

        // Add kill event to the kill list, will be used at the end of round to calculate trades
        let kill = {
            tick: killEvent.tick,
            attackerId: killEvent.attackerId,
            attackerSide: killEvent.attackerSide,
            victimId: killEvent.victimId,
            victimSide: killEvent.victimSide
        };

        // Put kill in order of tick, sorting by newest (largest) to oldest (smallest)
        for (let i = 0; i < this.kills.length; i++) {
            if (this.kills[i].tick < killEvent.tick) {
                this.kills.splice(i, 0, kill);
                return;
            }
        }
        // If kill happened after all current events, add to end of list
        this.kills.push(kill);
    }

    public complete() {
        // Create a user for each participant if one hasn't been created yet (needed for KAST)
        this.participants.forEach(entityId => this.getOrCreateUser(entityId));

        // Adding opening duel stats for first kill in round
        if (this.kills.length > 0) {
            let firstKill = this.kills[this.kills.length - 1];
            this.getOrCreateUser(firstKill.attackerId).openingKills = 1;
            this.getOrCreateUser(firstKill.attackerId).openingKillAttempts = 1;
            this.getOrCreateUser(firstKill.victimId).openingKillAttempts = 1;
        }

        // Calculate trades
        for (let i = 0; i < this.kills.length; i++) {
            let kill = this.kills[i];
            for (let x = i; x < this.kills.length; x++) {
                let possibleTrade = this.kills[x];
                if (kill.tick - possibleTrade.tick > TRADE_WINDOW) break;
                if (possibleTrade.attackerId === kill.victimId &&
                    possibleTrade.victimSide === kill.attackerSide) {
                    this.getOrCreateUser(kill.attackerId).tradeKills += 1;
                    this.getOrCreateUser(possibleTrade.victimId).timesTraded = 1;
                }
            }
        }

        // Calculate KAST
        Object.values(this.users).forEach((user: User) => {
            if (user.kills > 0 || user.assists > 0 || user.timesTraded > 0 || user.deaths === 0) {
                user.kastCount += 1;
            }
        });
    }

    private getOrCreateUser(entityId: number): User {
        if (!this.users[entityId]) {
            this.users[entityId] = new User();
        }
        return this.users[entityId];
    }
}

export interface IMatch {
    readonly matchId: number;
    users: {[entityId: number]: IUser};
    team1: ITeam;
    team2: ITeam;
}

export class Match {
    readonly matchId: number;

    public users: {[entityId: number]: User} = {};
    public team1: Team = new Team(1);
    public team2: Team = new Team(2);

    public roundCount: number = 0;
    public latestRound: number = -1;
    public rounds: {[round: number]: Round} = {};

    public events: {[round: number]: GameEvent[]} = {};

    constructor(matchId: number) {
        this.matchId = matchId;
    }

    public getRound(round: number): Round {
        if (!this.rounds[round]) {
            this.rounds[round] = new Round(round);
            if (round > this.latestRound) {
                this.latestRound = round;
            }
        }
        return this.rounds[round];
    }

    public addTeam(team: number, teamEvent: TeamEvent) {
        if (team === 0) {
            this.updateTeam(this.team1, teamEvent);
        } else if (team === 1) {
            this.updateTeam(this.team2, teamEvent);
        } else {
            console.log("Ignoring team " + team);
        }
    }

    public complete() {
        Object.values(this.rounds).forEach((round: Round) => {
            round.complete();
            Object.keys(round.users).map(Number).forEach((userId: number) => {
                this.getOrCreateUser(userId).addStats(round.users[userId]);
            });
        });
        this.roundCount = Object.keys(this.rounds).length;
    }

    private updateTeam(team: Team, teamEvent: TeamEvent) {
        // At the end of a match, a stats message is emitted with no score. Ignore it
        if (teamEvent.roundWins < team.wins) {
            return;
        }

        team.wins = teamEvent.roundWins;
        teamEvent.members.forEach((member: Member) => {
            this.getRound(this.latestRound).participants.push(member.entityId);
            team.userNames[member.entityId] = member.name;

            if (teamEvent.side === 0) {
                this.getOrCreateUser(member.entityId).atkRoundsPlayed++;
            } else if (teamEvent.side === 1) {
                this.getOrCreateUser(member.entityId).defRoundsPlayed++;
            } else {
                console.log("ERROR: Team event side is not 0 or 1")
            }
        });
    }

    private getOrCreateUser(entityId: number): User {
        if (!this.users[entityId]) {
            this.users[entityId] = new User();
        }
        return this.users[entityId];
    }
}