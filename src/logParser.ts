import {Match} from "./stats";
import {DamageEvent, KillEvent, TeamEvent} from "./events";

export class LogParser {

    private static TEAM_NAME_REGEX: RegExp = /RoundGUI :: Start\(\) Team Name Text (.+): \[(.+)\]/;
    private static STATS_REGEX: RegExp = /Stats :: (.+) :: (.+)/;

    public static parseFile(file: File, callback: { (fileName: string, matches: Match[]): void; }) {
        const reader = new FileReader();
        reader.onload = event => {
            if (event?.target?.result == null || typeof event.target.result !== 'string') {
                console.log("Could not read file, event returned null or did not return a string result");
                return;
            }
            this.handleFileLoad(event.target.result, file.name, callback);
        };
        reader.readAsText(file);
    }

    private static handleFileLoad(data: string, fileName: string, callback: { (fileName: string, matches: Match[]): void; }) {
        let fileLines = data.split("\n");
        let matches: Match[] = [];
        let currentMatch: Match | undefined;

        fileLines.forEach((line: string) => {
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

                let round = parseInt(parsedJson["round"]);

                if (!currentMatch || (parsedJson.hasOwnProperty("round") && round < currentMatch.latestRound)) {
                    if (currentMatch) {
                        currentMatch.complete();
                        matches.push(currentMatch);
                    }
                    currentMatch = new Match(matches.length + 1);
                }

                if (stats[1] === "Kill") {
                    currentMatch.getRound(round).addKill(new KillEvent(parsedJson));
                } else if (stats[1] === "Damage") {
                    currentMatch.getRound(round).addDamage(new DamageEvent(parsedJson));
                } else if (stats[1].startsWith("Team")) {
                    let team = parseInt(stats[1].slice(-1));
                    currentMatch.addTeam(team, new TeamEvent(parsedJson));
                } else {
                    console.log("Unknown stat: ");
                    console.log(stats);
                }
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