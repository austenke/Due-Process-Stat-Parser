import {Match} from "./stats";
import {DamageEvent, KillEvent, TeamEvent} from "./events";

export class LogParser {

    private static TEAM_NAME_REGEX: RegExp = /RoundGUI :: Start\(\) Team Name Text (.+): \[(.+)\]/;
    private static STATS_REGEX: RegExp = /Stats :: (.+) :: (.+)/;
    private static RESET_REGEX: RegExp = /Stats :: Resetting/;
    private static GECNET_MESSAGE: RegExp = /Received GECNet message (.+)/;

    public static parseFile(file: File, callback: { (fileName: string, matches: Match[]): void; }) {
        const reader = new FileReader();
        reader.onload = event => {
            if (event?.target?.result == null || typeof event.target.result !== 'string') {
                console.log("Could not read file, event returned null or did not return a string result");
                return;
            }
            LogParser.parseFileData(event.target.result, file.name, callback);
        };
        reader.readAsText(file);
    }

    public static parseFileData(data: string, fileName: string, callback: { (fileName: string, matches: Match[]): void; }) {
        let fileLines = data.split("\n");
        let matches: Match[] = [];
        let currentMatch: Match | undefined;
        let accountId: string | undefined;

        fileLines.forEach((line: string) => {
            let gecnet = line.match(LogParser.GECNET_MESSAGE);
            if (gecnet && gecnet[0]) {
                let json = JSON.parse(gecnet[1]);
                if (json.data) {
                    if (json.type === "myProfile") {
                        let data = JSON.parse(json.data);
                        accountId = data.AccountId;
                    } else if (json.type === "updateMatchScore") {
                        let data = JSON.parse(json.data);
                        if (accountId && (data.Team1Members.includes(accountId) || data.Team2Members.includes(accountId))) {
                            data.Spectators.forEach((spectator: string) => {
                                if (!currentMatch?.spectators.includes(spectator)) {
                                    currentMatch?.spectators.push(spectator);
                                    console.log("Added " + spectator + " to current match");
                                }
                            });
                        }
                    }
                }
                return;
            }

            let reset = line.match(LogParser.RESET_REGEX);
            if (reset && reset[0]) {
                if (currentMatch) {
                    currentMatch.complete();
                    matches.push(currentMatch);
                    currentMatch = new Match(matches.length + 1);
                }
            }

            let stats = line.match(LogParser.STATS_REGEX);
            if (stats && stats[0]) {
                let parsedJson: any;

                try {
                    parsedJson = JSON.parse(stats[2]);
                } catch (err) {
                    console.log("Ran into error parsing message:");
                    console.log(stats[2]);
                    return;
                }

                if (parsedJson.hasOwnProperty("round")) {
                    let round = parseInt(parsedJson["round"]);
                    if (!currentMatch || round < (currentMatch.latestRound - 1)) {
                        if (currentMatch) {
                            currentMatch.complete();
                            matches.push(currentMatch);
                        }
                        currentMatch = new Match(matches.length + 1);
                    }

                    if (stats[1] === "Kill") {
                        let event = new KillEvent(parsedJson);
                        currentMatch.addEvent(event);
                        currentMatch.getRound(round).addKill(event);
                        return;
                    } else if (stats[1] === "Damage") {
                        let event = new DamageEvent(parsedJson);
                        currentMatch.addEvent(event);
                        currentMatch.getRound(round).addDamage(event);
                        return;
                    }
                }

                if (currentMatch && stats[1].startsWith("Team")) {
                    let team = parseInt(stats[1].slice(-1));
                    currentMatch.addTeam(team, new TeamEvent(parsedJson));
                    return;
                }

                console.log("Unknown stat: ");
                console.log(stats);
            } else if (currentMatch) {
                let name = line.match(LogParser.TEAM_NAME_REGEX);
                if (name && name[0]) {
                    if (name[1] === "1") {
                        currentMatch.team1.name = name[2];
                    } else if (name[1] === "2") {
                        currentMatch.team2.name = name[2];
                    } else {
                        console.log("UNKNOWN TEAM: " + name[1]);
                    }
                    return;
                }
            }
        });

        if (currentMatch) {
            currentMatch.complete();
            matches.push(currentMatch);
        }

        callback(fileName, matches);
    }
}