export class DamageEvent {
    readonly round: number
    readonly attackerId: number;
    readonly attackerSide: number;
    readonly victimId: number;
    readonly victimSide: number;
    readonly tick: number;
    readonly damageDealt: number;
    readonly damageSource: number;
    
    constructor(json: any) {
        this.round = json["round"];
        this.attackerId = json["attackerId"];
        this.attackerSide = json["attackerSide"];
        this.victimId = json["victimId"];
        this.victimSide = json["victimSide"];
        this.tick = json["tick"];
        this.damageDealt = json["damageDealt"];
        this.damageSource = json["damageSource"];
    }
}

export class KillEvent {
    readonly attackerId: number;
    readonly attackerSide: number;
    readonly victimId: number;
    readonly victimSide: number;
    readonly tick: number;
    readonly damageSource: number;

    constructor(json: any) {
        this.attackerId = json["attackerId"];
        this.attackerSide = json["attackerSide"];
        this.victimId = json["victimId"];
        this.victimSide = json["victimSide"];
        this.tick = json["tick"];
        this.damageSource = json["damageSource"];
    }
}

export class Member {
    readonly accountId: string;
    readonly entityId: number;
    readonly name: string;

    constructor(json: any) {
        this.accountId = json["AccountId"];
        this.entityId = json["EntityId"];
        this.name = json["Name"];
    }
}

export class TeamEvent {
    readonly side: number;
    readonly roundOutcomes: number[];
    readonly roundWins: number;
    readonly members: Member[];

    constructor(json: any) {
        this.side = json["Side"];
        this.roundOutcomes = json["RoundOutcomes"];
        this.roundWins = json["RoundWins"];
        this.members = [];
        json["Members"].forEach((memberJson: any) => this.members.push(new Member(memberJson)));
    }
}